# NIBM Excel Calendar Sync

Small calendar sync app that downloads the public NIBM SharePoint Excel schedule and syncs it to Google Calendar.

The sync creates one event per module per date. Every event is scheduled from `9:00 AM` to `4:00 PM` in `Asia/Colombo`, and event titles contain only the module name.

## Hosted Cloudflare Worker

This is the recommended free hosted setup for you and friends.

### 1. Install dependencies

```powershell
npm install
```

### 2. Create the D1 database

```powershell
npx wrangler d1 create nibm-calendar-sync
```

Copy the returned `database_id` into `wrangler.toml`.

### 3. Apply the D1 migration

```powershell
npm run db:migrate:remote
```

### 4. Create Google OAuth credentials

In Google Cloud Console:

- Enable the Google Calendar API.
- Configure OAuth consent screen as External.
- Add yourself and friends as test users.
- Create a Web application OAuth client.
- Add this authorized redirect URI after replacing the Worker subdomain:

```text
https://nibm-calendar-sync.YOUR_SUBDOMAIN.workers.dev/auth/callback
```

Use the same callback in `wrangler.toml` as `GOOGLE_REDIRECT_URI`.

### 5. Add Cloudflare secrets

```powershell
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

Use a long random value for `TOKEN_ENCRYPTION_KEY`. It encrypts stored Google refresh tokens.

### 6. Deploy

```powershell
npm run deploy
```

Open the deployed Worker URL and click `Connect Google Calendar`.

### 7. Manual sync test

After connecting at least one account, trigger a sync manually:

```powershell
curl -X POST "https://nibm-calendar-sync.YOUR_SUBDOMAIN.workers.dev/admin/sync" -H "x-cron-secret: YOUR_TOKEN_ENCRYPTION_KEY"
```

The scheduled Worker also runs hourly from the cron in `wrangler.toml`. Cloudflare cron uses UTC, so the configured `0 * * * *` checks for schedule changes at the start of every hour.

## Local CLI

The original personal CLI is still available. Copy `.env.example` to `.env`, set the Google OAuth values, then run:

```powershell
npm run auth
npm run sync
```

## Behavior

- Downloads the Excel file from `SHAREPOINT_EXCEL_URL`.
- Parses the first worksheet.
- Treats column 1 as the date and all later columns as schedule cells.
- Extracts module names like `Robotics`, `MAD`, `ECS II`, `EAD2`, and `ITMP`.
- Creates or reuses a Google Calendar named `NIBM Schedule`.
- Only creates, updates, or deletes events marked as managed by this tool.
- Does not touch personal/manual Google Calendar events.
- Hosted Worker stores Google refresh tokens encrypted in D1.
- When the Excel sheet removes or moves a module/date, the next sync removes the old managed event and creates the new one.
- Cells marked as postponed or cancelled are skipped instead of being added to the calendar.
- If events appear as `3:30 AM - 10:30 AM`, your Google Calendar/device is showing the same Sri Lanka event in UTC. Set the calendar or device timezone to Sri Lanka/Colombo.

## Commands

```powershell
npm run auth
npm run sync
npm run test
npm run typecheck
npm run deploy
npm run db:migrate:remote
```
