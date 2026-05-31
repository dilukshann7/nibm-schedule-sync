import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { google, type calendar_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { AppConfig } from "./config.js";
import { MANAGED_SOURCE, type CalendarEvent, type DesiredEvent } from "./types.js";

const TOKEN_PATH = ".google-token.json";
const SCOPES = ["https://www.googleapis.com/auth/calendar"];

export function createOAuthClient(config: AppConfig): OAuth2Client {
  return new google.auth.OAuth2(config.googleClientId, config.googleClientSecret, config.googleRedirectUri);
}

export async function runAuth(config: AppConfig): Promise<void> {
  const client = createOAuthClient(config);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });

  console.log("Open this URL in your browser:");
  console.log(authUrl);

  const readline = createInterface({ input, output });
  const codeOrUrl = await readline.question("Paste the authorization code or redirected URL here: ");
  readline.close();

  const code = extractCode(codeOrUrl);
  const { tokens } = await client.getToken(code);
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`Saved Google token to ${TOKEN_PATH}`);
}

export async function getAuthorizedCalendar(config: AppConfig): Promise<calendar_v3.Calendar> {
  const client = createOAuthClient(config);

  if (!existsSync(TOKEN_PATH)) {
    throw new Error(`Missing ${TOKEN_PATH}. Run npm run auth first.`);
  }

  client.setCredentials(JSON.parse(await readFile(TOKEN_PATH, "utf8")));
  client.on("tokens", async (tokens) => {
    if (tokens.refresh_token || tokens.access_token) {
      const current = existsSync(TOKEN_PATH) ? JSON.parse(await readFile(TOKEN_PATH, "utf8")) : {};
      await writeFile(TOKEN_PATH, JSON.stringify({ ...current, ...tokens }, null, 2));
    }
  });

  return google.calendar({ version: "v3", auth: client });
}

export async function getOrCreateCalendarId(calendar: calendar_v3.Calendar, name: string, timeZone: string): Promise<string> {
  const calendars = await calendar.calendarList.list();
  const existing = calendars.data.items?.find((item) => item.summary === name);

  if (existing?.id) {
    return existing.id;
  }

  const created = await calendar.calendars.insert({
    requestBody: {
      summary: name,
      timeZone
    }
  });

  if (!created.data.id) {
    throw new Error(`Google Calendar did not return an id for ${name}.`);
  }

  return created.data.id;
}

export async function listManagedEvents(calendar: calendar_v3.Calendar, calendarId: string): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendar.events.list({
      calendarId,
      singleEvents: true,
      maxResults: 2500,
      pageToken
    });

    for (const item of response.data.items ?? []) {
      const id = item.id;
      const title = item.summary || "";
      const startDateTime = stripOffset(item.start?.dateTime || "");
      const endDateTime = stripOffset(item.end?.dateTime || "");
      const explicitSourceKey = item.extendedProperties?.private?.sourceKey;
      const explicitSource = item.extendedProperties?.private?.source;

      if (!id || !title || !startDateTime || !endDateTime) {
        continue;
      }

      if (explicitSource && explicitSource !== MANAGED_SOURCE) {
        continue;
      }

      const sourceKey = explicitSourceKey || inferLegacySourceKey(startDateTime, title);

      if (!sourceKey) {
        continue;
      }

      const metadataMissing = explicitSource !== MANAGED_SOURCE || explicitSourceKey !== sourceKey;

      events.push({
        id,
        sourceKey,
        title,
        startDateTime,
        endDateTime,
        timeZone: item.start?.timeZone || "",
        managedSource: MANAGED_SOURCE,
        ...(metadataMissing ? { metadataMissing: true } : {})
      });
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return events;
}

export async function createCalendarEvent(calendar: calendar_v3.Calendar, calendarId: string, event: DesiredEvent): Promise<void> {
  await calendar.events.insert({
    calendarId,
    requestBody: toGoogleEvent(event)
  });
}

export async function updateCalendarEvent(calendar: calendar_v3.Calendar, calendarId: string, id: string, event: DesiredEvent): Promise<void> {
  await calendar.events.update({
    calendarId,
    eventId: id,
    requestBody: toGoogleEvent(event)
  });
}

export async function deleteCalendarEvent(calendar: calendar_v3.Calendar, calendarId: string, id: string): Promise<void> {
  await calendar.events.delete({
    calendarId,
    eventId: id
  });
}

function toGoogleEvent(event: DesiredEvent): calendar_v3.Schema$Event {
  return {
    summary: event.title,
    start: {
      dateTime: event.startDateTime,
      timeZone: event.timeZone
    },
    end: {
      dateTime: event.endDateTime,
      timeZone: event.timeZone
    },
    extendedProperties: {
      private: {
        source: MANAGED_SOURCE,
        sourceKey: event.sourceKey
      }
    }
  };
}

function stripOffset(value: string): string {
  return value.replace(/(?:Z|[+-]\d{2}:\d{2})$/, "");
}

function inferLegacySourceKey(startDateTime: string, title: string): string | null {
  const date = startDateTime.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return `${date}|${title}`;
}

function extractCode(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.startsWith("http")) {
    return trimmed;
  }

  const parsed = new URL(trimmed);
  const code = parsed.searchParams.get("code");

  if (!code) {
    throw new Error("The redirected URL did not contain a code parameter.");
  }

  return code;
}
