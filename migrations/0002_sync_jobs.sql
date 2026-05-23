CREATE TABLE IF NOT EXISTS sync_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  desired_events TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  last_error TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_status_created_at ON sync_jobs(status, created_at);
