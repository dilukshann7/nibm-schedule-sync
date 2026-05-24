import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env, StoredUser } from "../src/workerTypes.js";
import type { DesiredEvent } from "../src/types.js";

const decryptRefreshToken = vi.fn();
const refreshAccessToken = vi.fn();
const createCalendar = vi.fn();
const updateUserCalendarId = vi.fn();
const markUserSynced = vi.fn();
const downloadExcelForWorker = vi.fn();
const parseWorkbookForWorker = vi.fn();
const listManagedEvents = vi.fn();
const insertEvent = vi.fn();
const updateEvent = vi.fn();
const deleteEvent = vi.fn();

vi.mock("../src/workerAuth.js", () => ({
  decryptRefreshToken
}));

vi.mock("../src/workerExcel.js", () => ({
  downloadExcelForWorker
}));

vi.mock("../src/workerXlsx.js", () => ({
  parseWorkbookForWorker
}));

vi.mock("../src/workerGoogle.js", () => ({
  createCalendar,
  deleteEvent,
  insertEvent,
  listManagedEvents,
  refreshAccessToken,
  updateEvent
}));

vi.mock("../src/workerDb.js", () => ({
  markUserSynced,
  updateUserCalendarId
}));

function env(): Env {
  return {
    DB: {} as D1Database,
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_REDIRECT_URI: "https://sync.example.com/auth/callback",
    TOKEN_ENCRYPTION_KEY: "secret",
    SHAREPOINT_EXCEL_URL: "https://example.com/schedule.xlsx",
    GOOGLE_CALENDAR_NAME: "NIBM Schedule",
    TIMEZONE: "Asia/Colombo",
    EVENT_START: "09:00",
    EVENT_END: "16:00",
    WORKER_ORIGIN: "https://sync.example.com"
  };
}

function user(): StoredUser {
  return {
    id: "user-1",
    email: "student@example.com",
    encrypted_refresh_token: "encrypted",
    token_iv: "iv",
    google_calendar_id: "calendar-1",
    is_active: 1
  };
}

function desiredEvent(index: number): DesiredEvent {
  const day = String(index + 1).padStart(2, "0");
  const date = `2026-06-${day}`;

  return {
    sourceKey: `${date}|Module ${index}`,
    title: `Module ${index}`,
    date,
    startDateTime: `${date}T09:00:00`,
    endDateTime: `${date}T16:00:00`,
    timeZone: "Asia/Colombo"
  };
}

describe("initial sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decryptRefreshToken.mockResolvedValue("refresh-token");
    refreshAccessToken.mockResolvedValue({ access_token: "access-token" });
    downloadExcelForWorker.mockResolvedValue(new ArrayBuffer(0));
    parseWorkbookForWorker.mockReturnValue(Array.from({ length: 12 }, (_, index) => desiredEvent(index)));
    listManagedEvents.mockResolvedValue([]);
    insertEvent.mockResolvedValue(undefined);
    updateEvent.mockResolvedValue(undefined);
    deleteEvent.mockResolvedValue(undefined);
    createCalendar.mockResolvedValue("calendar-1");
    updateUserCalendarId.mockResolvedValue(undefined);
    markUserSynced.mockResolvedValue(undefined);
  });

  it("inserts only the first ten events on connect", async () => {
    const { runImmediateUserSync } = await import("../src/workerSync.js");

    const stats = await runImmediateUserSync(env(), user(), "initial-access-token");

    expect(insertEvent).toHaveBeenCalledTimes(10);
    expect(stats).toEqual({ created: 10, updated: 0, deleted: 0 });
  });
});
