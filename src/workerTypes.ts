export type Env = {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  TOKEN_ENCRYPTION_KEY: string;
  SHAREPOINT_EXCEL_URL: string;
  GOOGLE_CALENDAR_NAME: string;
  TIMEZONE: string;
  EVENT_START: string;
  EVENT_END: string;
  WORKER_ORIGIN: string;
};

export type StoredUser = {
  id: string;
  email: string;
  encrypted_refresh_token: string;
  token_iv: string;
  google_calendar_id: string | null;
  is_active: number;
};

export type SyncStats = {
  created: number;
  updated: number;
  deleted: number;
};

export type SyncJob = {
  id: string;
  user_id: string;
  desired_events: string;
  status: string;
};
