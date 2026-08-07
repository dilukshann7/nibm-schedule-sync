import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/workerTypes.js";

const downloadExcelForWorker = vi.fn();
const parseWorkbookForWorker = vi.fn();

vi.mock("../src/workerExcel.js", () => ({ downloadExcelForWorker }));
vi.mock("../src/workerXlsx.js", () => ({ parseWorkbookForWorker }));
vi.mock("../src/workerSync.js", () => ({
  enqueueInitialUserSync: vi.fn(),
  processNextSyncJob: vi.fn(),
  runImmediateUserSync: vi.fn(),
  runScheduledSync: vi.fn()
}));
vi.mock("../src/workerAuth.js", () => ({
  buildGoogleAuthUrl: vi.fn(),
  encryptRefreshToken: vi.fn()
}));
vi.mock("../src/workerDb.js", () => ({
  disconnectUser: vi.fn(),
  getUserByEmail: vi.fn(),
  upsertUser: vi.fn()
}));
vi.mock("../src/workerGoogle.js", () => ({
  exchangeCodeForTokens: vi.fn(),
  fetchGoogleProfile: vi.fn()
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

function context(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {}
  } as unknown as ExecutionContext;
}

describe("Apple Calendar feed route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the generated public calendar feed", async () => {
    const workbook = new ArrayBuffer(0);
    downloadExcelForWorker.mockResolvedValue(workbook);
    parseWorkbookForWorker.mockReturnValue([
      {
        sourceKey: "2026-08-07|Robotics",
        title: "Robotics",
        date: "2026-08-07",
        startDateTime: "2026-08-07T09:00:00",
        endDateTime: "2026-08-07T16:00:00",
        timeZone: "Asia/Colombo"
      }
    ]);

    const worker = (await import("../src/worker.js")).default;
    const response = await worker.fetch(new Request("https://sync.example.com/calendar.ics"), env(), context());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=900, s-maxage=900");
    expect(body).toContain("SUMMARY:Robotics");
    expect(downloadExcelForWorker).toHaveBeenCalledWith("https://example.com/schedule.xlsx");
    expect(parseWorkbookForWorker).toHaveBeenCalledWith(workbook, "Asia/Colombo", "09:00", "16:00");
  });

  it("returns 502 when the schedule cannot be loaded", async () => {
    downloadExcelForWorker.mockRejectedValue(new Error("SharePoint unavailable"));

    const worker = (await import("../src/worker.js")).default;
    const response = await worker.fetch(new Request("https://sync.example.com/calendar.ics"), env(), context());

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Calendar feed unavailable");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
