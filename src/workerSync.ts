import { planCalendarSync } from "./syncPlanner.js";
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
  finishSyncRun,
  getActiveUsers,
  markUserFailed,
  markUserSynced,
  updateUserCalendarId
} from "./workerDb.js";
import type { Env, StoredUser, SyncStats } from "./workerTypes.js";
import type { DesiredEvent } from "./types.js";

export async function runScheduledSync(env: Env): Promise<void> {
  const runId = await createSyncRun(env.DB);
  const stats: SyncStats = { created: 0, updated: 0, deleted: 0 };
  let usersChecked = 0;
  let usersFailed = 0;

  try {
    const workbook = await downloadExcelForWorker(env.SHAREPOINT_EXCEL_URL);
    const desiredEvents = parseWorkbookForWorker(workbook, env.TIMEZONE, env.EVENT_START, env.EVENT_END);
    const users = await getActiveUsers(env.DB);
    usersChecked = users.length;

    for (const user of users) {
      try {
        const userStats = await syncUser(env, user, desiredEvents);
        stats.created += userStats.created;
        stats.updated += userStats.updated;
        stats.deleted += userStats.deleted;
        await markUserSynced(env.DB, user.id);
      } catch (error) {
        usersFailed += 1;
        await markUserFailed(env.DB, user.id, error);
      }
    }

    await finishSyncRun(env.DB, runId, { usersChecked, usersFailed, stats });
  } catch (error) {
    await finishSyncRun(env.DB, runId, { usersChecked, usersFailed, stats, error });
    throw error;
  }
}

async function syncUser(env: Env, user: StoredUser, desiredEvents: DesiredEvent[]): Promise<SyncStats> {
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

  for (const event of plan.toCreate) {
    await insertEvent(accessToken, calendarId, event);
  }

  for (const update of plan.toUpdate) {
    await updateEvent(accessToken, calendarId, update.id, update.event);
  }

  for (const id of plan.toDelete) {
    await deleteEvent(accessToken, calendarId, id);
  }

  return {
    created: plan.toCreate.length,
    updated: plan.toUpdate.length,
    deleted: plan.toDelete.length
  };
}
