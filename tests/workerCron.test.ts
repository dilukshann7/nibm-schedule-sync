import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env, StoredUser } from "../src/workerTypes.js";

const runScheduledSync = vi.fn();
const processNextSyncJob = vi.fn();
const buildGoogleAuthUrl = vi.fn();
const encryptRefreshToken = vi.fn();
const exchangeCodeForTokens = vi.fn();
const fetchGoogleProfile = vi.fn();
const getUserByEmail = vi.fn();
const upsertUser = vi.fn();
const disconnectUser = vi.fn();
const enqueueInitialUserSync = vi.fn();
const runImmediateUserSync = vi.fn();

vi.mock("../src/workerSync.js", () => ({
  enqueueInitialUserSync,
  processNextSyncJob,
  runImmediateUserSync,
  runScheduledSync
}));

vi.mock("../src/workerAuth.js", () => ({
  buildGoogleAuthUrl,
  encryptRefreshToken
}));

vi.mock("../src/workerDb.js", () => ({
  disconnectUser,
  getUserByEmail,
  upsertUser
}));

vi.mock("../src/workerGoogle.js", () => ({
  exchangeCodeForTokens,
  fetchGoogleProfile
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

function executionContext() {
  const pending: Promise<unknown>[] = [];

  return {
    ctx: {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
      },
      passThroughOnException() {}
    } as unknown as ExecutionContext,
    pending
  };
}

describe("cron job processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runScheduledSync.mockResolvedValue(undefined);
    processNextSyncJob.mockResolvedValue({
      processed: true,
      hasMore: true,
      stats: { created: 10, updated: 0, deleted: 0 }
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("checks for schedule changes and processes only one chunk per cron tick", async () => {
    const worker = (await import("../src/worker.js")).default;
    const { ctx, pending } = executionContext();

    await worker.scheduled({} as ScheduledEvent, env(), ctx);
    await Promise.all(pending);

    expect(runScheduledSync).toHaveBeenCalledTimes(1);
    expect(processNextSyncJob).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("queues the remaining initial sync without immediately draining future chunks", async () => {
    const worker = (await import("../src/worker.js")).default;
    const { ctx, pending } = executionContext();
    const user: StoredUser = {
      id: "user-1",
      email: "student@example.com",
      encrypted_refresh_token: "encrypted",
      token_iv: "iv",
      google_calendar_id: "calendar-1",
      is_active: 1
    };

    exchangeCodeForTokens.mockResolvedValue({ access_token: "access-token", refresh_token: "refresh-token" });
    fetchGoogleProfile.mockResolvedValue({ sub: "user-1", email: "student@example.com" });
    encryptRefreshToken.mockResolvedValue({ ciphertext: "encrypted", iv: "iv" });
    getUserByEmail.mockResolvedValue(user);
    runImmediateUserSync.mockResolvedValue({ created: 10, updated: 0, deleted: 0 });
    enqueueInitialUserSync.mockResolvedValue(undefined);

    const response = await worker.fetch(
      new Request("https://sync.example.com/auth/callback?code=oauth-code&state=state", {
        headers: { cookie: "oauth_state=state" }
      }),
      env(),
      ctx
    );
    await Promise.all(pending);

    expect(response.status).toBe(200);
    expect(runImmediateUserSync).toHaveBeenCalledTimes(1);
    expect(enqueueInitialUserSync).toHaveBeenCalledTimes(1);
    expect(processNextSyncJob).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
