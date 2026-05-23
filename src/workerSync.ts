import { planCalendarSync } from "./syncPlanner.js";
import { limitSyncPlan } from "./syncBatch.js";
import { decryptRefreshToken } from "./workerAuth.js";
import {
  createCalendar,
  deleteEvent,
  insertEvent,
  listManagedEvents,
  refreshAccessToken,
  updateEvent
} from "./workerGoogle.js";
import { downloadExcelForWorker } from "./workerExcel.js";
import { parseWorkbookForWorker } from "./workerXlsx.js";
import {
  createSyncRun,
  completeSyncJob,
  createSyncJob,
  failSyncJob,
  finishSyncRun,
  getActiveUsers,
  getNextPendingSyncJob,
  getUserById,
  markUserFailed,
  markUserSynced,
  updateUserCalendarId
} from "./workerDb.js";
import type { Env, StoredUser, SyncStats } from "./workerTypes.js";
import type { DesiredEvent } from "./types.js";

const MAX_CALENDAR_MUTATIONS_PER_INVOCATION = 20;
const MAX_IMMEDIATE_CALENDAR_MUTATIONS = 30;
const IMMEDIATE_WINDOW_DAYS = 35;

export async function runScheduledSync(env: Env): Promise<void> {
  const runId = await createSyncRun(env.DB);
  const stats: SyncStats = { created: 0, updated: 0, deleted: 0 };
  let usersChecked = 0;

  try {
    const workbook = await downloadExcelForWorker(env.SHAREPOINT_EXCEL_URL);
    const desiredEvents = parseWorkbookForWorker(workbook, env.TIMEZONE, env.EVENT_START, env.EVENT_END);
    const desiredEventsJson = JSON.stringify(desiredEvents);
    const users = await getActiveUsers(env.DB);
    usersChecked = users.length;

    for (const user of users) {
      await createSyncJob(env.DB, user.id, desiredEventsJson);
    }

    await finishSyncRun(env.DB, runId, { usersChecked, usersFailed: 0, stats });
  } catch (error) {
    await finishSyncRun(env.DB, runId, { usersChecked, usersFailed: usersChecked, stats, error });
    throw error;
  }
}

export async function enqueueInitialUserSync(env: Env, user: StoredUser): Promise<void> {
  try {
    const workbook = await downloadExcelForWorker(env.SHAREPOINT_EXCEL_URL);
    const desiredEvents = parseWorkbookForWorker(workbook, env.TIMEZONE, env.EVENT_START, env.EVENT_END);
    await createSyncJob(env.DB, user.id, JSON.stringify(desiredEvents));
  } catch (error) {
    await markUserFailed(env.DB, user.id, error);
    throw error;
  }
}

export async function runImmediateUserSync(env: Env, user: StoredUser, accessToken: string): Promise<SyncStats> {
  const workbook = await downloadExcelForWorker(env.SHAREPOINT_EXCEL_URL);
  const desiredEvents = filterEventsForImmediateWindow(
    parseWorkbookForWorker(workbook, env.TIMEZONE, env.EVENT_START, env.EVENT_END),
    currentIsoDate(),
    IMMEDIATE_WINDOW_DAYS
  );
  let calendarId = user.google_calendar_id;

  if (!calendarId) {
    calendarId = await createCalendar(accessToken, env.GOOGLE_CALENDAR_NAME, env.TIMEZONE);
    await updateUserCalendarId(env.DB, user.id, calendarId);
  }

  const existingEvents = await listManagedEvents(accessToken, calendarId);
  const limited = limitSyncPlan(planCalendarSync(desiredEvents, existingEvents), MAX_IMMEDIATE_CALENDAR_MUTATIONS);

  for (const event of limited.limitedPlan.toCreate) {
    await insertEvent(accessToken, calendarId, event);
  }

  for (const update of limited.limitedPlan.toUpdate) {
    await updateEvent(accessToken, calendarId, update.id, update.event);
  }

  for (const id of limited.limitedPlan.toDelete) {
    await deleteEvent(accessToken, calendarId, id);
  }

  await markUserSynced(env.DB, user.id);

  return {
    created: limited.limitedPlan.toCreate.length,
    updated: limited.limitedPlan.toUpdate.length,
    deleted: limited.limitedPlan.toDelete.length
  };
}

export async function processNextSyncJob(env: Env): Promise<{ processed: boolean; hasMore: boolean; stats: SyncStats }> {
  const job = await getNextPendingSyncJob(env.DB);

  if (!job) {
    return { processed: false, hasMore: false, stats: { created: 0, updated: 0, deleted: 0 } };
  }

  try {
    const user = await getUserById(env.DB, job.user_id);

    if (!user || !user.is_active) {
      await completeSyncJob(env.DB, job.id);
      return { processed: true, hasMore: true, stats: { created: 0, updated: 0, deleted: 0 } };
    }

    const desiredEvents = JSON.parse(job.desired_events) as DesiredEvent[];
    const result = await syncUserChunk(env, user, desiredEvents);

    if (!result.hasMore) {
      await completeSyncJob(env.DB, job.id);
      await markUserSynced(env.DB, user.id);
    }

    return { processed: true, hasMore: result.hasMore || Boolean(await getNextPendingSyncJob(env.DB)), stats: result.stats };
  } catch (error) {
    await failSyncJob(env.DB, job.id, error);
    await markUserFailed(env.DB, job.user_id, error);
    return { processed: true, hasMore: Boolean(await getNextPendingSyncJob(env.DB)), stats: { created: 0, updated: 0, deleted: 0 } };
  }
}

export function filterEventsForImmediateWindow(events: DesiredEvent[], todayIsoDate: string, days: number): DesiredEvent[] {
  const start = dateToDayNumber(todayIsoDate);
  const end = start + days;

  return events.filter((event) => {
    const eventDay = dateToDayNumber(event.date);
    return eventDay >= start && eventDay <= end;
  });
}

async function syncUserChunk(env: Env, user: StoredUser, desiredEvents: DesiredEvent[]): Promise<{ stats: SyncStats; hasMore: boolean }> {
  const refreshToken = await decryptRefreshToken(
    {
      ciphertext: user.encrypted_refresh_token,
      iv: user.token_iv
    },
    env.TOKEN_ENCRYPTION_KEY
  );
  const token = await refreshAccessToken(
    {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI
    },
    refreshToken
  );
  const accessToken = token.access_token;
  let calendarId = user.google_calendar_id;

  if (!calendarId) {
    calendarId = await createCalendar(accessToken, env.GOOGLE_CALENDAR_NAME, env.TIMEZONE);
    await updateUserCalendarId(env.DB, user.id, calendarId);
  }

  const existingEvents = await listManagedEvents(accessToken, calendarId);
  const plan = planCalendarSync(desiredEvents, existingEvents);
  const limited = limitSyncPlan(plan, MAX_CALENDAR_MUTATIONS_PER_INVOCATION);

  for (const event of limited.limitedPlan.toCreate) {
    await insertEvent(accessToken, calendarId, event);
  }

  for (const update of limited.limitedPlan.toUpdate) {
    await updateEvent(accessToken, calendarId, update.id, update.event);
  }

  for (const id of limited.limitedPlan.toDelete) {
    await deleteEvent(accessToken, calendarId, id);
  }

  return {
    stats: {
      created: limited.limitedPlan.toCreate.length,
      updated: limited.limitedPlan.toUpdate.length,
      deleted: limited.limitedPlan.toDelete.length
    },
    hasMore: limited.hasMore
  };
}

function currentIsoDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

function dateToDayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86400000);
}
