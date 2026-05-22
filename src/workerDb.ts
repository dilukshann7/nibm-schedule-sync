import type { StoredUser, SyncStats } from "./workerTypes.js";

export async function upsertUser(
  db: D1Database,
  user: {
    id: string;
    email: string;
    encryptedRefreshToken: string;
    tokenIv: string;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, email, encrypted_refresh_token, token_iv, is_active, updated_at)
       VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         encrypted_refresh_token = excluded.encrypted_refresh_token,
         token_iv = excluded.token_iv,
         is_active = 1,
         updated_at = CURRENT_TIMESTAMP,
         last_error = NULL`
    )
    .bind(user.id, user.email, user.encryptedRefreshToken, user.tokenIv)
    .run();
}

export async function getActiveUsers(db: D1Database): Promise<StoredUser[]> {
  const result = await db.prepare("SELECT * FROM users WHERE is_active = 1 ORDER BY created_at ASC").all<StoredUser>();
  return result.results ?? [];
}

export async function getUserByEmail(db: D1Database, email: string): Promise<StoredUser | null> {
  return db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").bind(email).first<StoredUser>();
}

export async function disconnectUser(db: D1Database, email: string): Promise<void> {
  await db.prepare("UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE lower(email) = lower(?)").bind(email).run();
}

export async function updateUserCalendarId(db: D1Database, userId: string, calendarId: string): Promise<void> {
  await db.prepare("UPDATE users SET google_calendar_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(calendarId, userId).run();
}

export async function markUserSynced(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare("UPDATE users SET last_sync_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(userId)
    .run();
}

export async function markUserFailed(db: D1Database, userId: string, error: unknown): Promise<void> {
  await db
    .prepare("UPDATE users SET last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(error instanceof Error ? error.message : String(error), userId)
    .run();
}

export async function createSyncRun(db: D1Database): Promise<number> {
  const result = await db.prepare("INSERT INTO sync_runs DEFAULT VALUES").run();
  return Number(result.meta.last_row_id);
}

export async function finishSyncRun(
  db: D1Database,
  id: number,
  counts: {
    usersChecked: number;
    usersFailed: number;
    stats: SyncStats;
    error?: unknown;
  }
): Promise<void> {
  await db
    .prepare(
      `UPDATE sync_runs
       SET finished_at = CURRENT_TIMESTAMP,
           users_checked = ?,
           users_failed = ?,
           events_created = ?,
           events_updated = ?,
           events_deleted = ?,
           error = ?
       WHERE id = ?`
    )
    .bind(
      counts.usersChecked,
      counts.usersFailed,
      counts.stats.created,
      counts.stats.updated,
      counts.stats.deleted,
      counts.error ? (counts.error instanceof Error ? counts.error.message : String(counts.error)) : null,
      id
    )
    .run();
}
