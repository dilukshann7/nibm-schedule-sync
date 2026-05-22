import { MANAGED_SOURCE, type CalendarEvent, type DesiredEvent } from "./types.js";

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  id_token?: string;
};

export type GoogleProfile = {
  sub: string;
  email: string;
};

export type GoogleEvent = {
  id?: string;
  summary?: string;
  start?: {
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    timeZone?: string;
  };
  extendedProperties?: {
    private?: Record<string, string>;
  };
};

export type GoogleCalendarClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export async function exchangeCodeForTokens(config: GoogleCalendarClientConfig, code: string): Promise<GoogleTokenResponse> {
  return googleTokenRequest({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
    grant_type: "authorization_code"
  });
}

export async function refreshAccessToken(config: GoogleCalendarClientConfig, refreshToken: string): Promise<GoogleTokenResponse> {
  return googleTokenRequest({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  return googleFetchJson<GoogleProfile>("https://openidconnect.googleapis.com/v1/userinfo", accessToken);
}

export async function createCalendar(accessToken: string, summary: string, timeZone: string): Promise<string> {
  const response = await googleFetchJson<{ id?: string }>("https://www.googleapis.com/calendar/v3/calendars", accessToken, {
    method: "POST",
    body: JSON.stringify({ summary, timeZone })
  });

  if (!response.id) {
    throw new Error("Google did not return a calendar id.");
  }

  return response.id;
}

export async function listManagedEvents(accessToken: string, calendarId: string): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "2500");
    url.searchParams.append("privateExtendedProperty", `source=${MANAGED_SOURCE}`);

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await googleFetchJson<{ items?: GoogleEvent[]; nextPageToken?: string }>(url.toString(), accessToken);
    events.push(...(response.items ?? []).map(fromGoogleEvent).filter((event): event is CalendarEvent => Boolean(event)));
    pageToken = response.nextPageToken;
  } while (pageToken);

  return events;
}

export async function insertEvent(accessToken: string, calendarId: string, event: DesiredEvent): Promise<void> {
  await googleFetchJson(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, {
    method: "POST",
    body: JSON.stringify(toGoogleEventBody(event))
  });
}

export async function updateEvent(accessToken: string, calendarId: string, eventId: string, event: DesiredEvent): Promise<void> {
  await googleFetchJson(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify(toGoogleEventBody(event))
    }
  );
}

export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  await googleFetchJson(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    accessToken,
    { method: "DELETE" }
  );
}

export function toGoogleEventBody(event: DesiredEvent): GoogleEvent {
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

export function fromGoogleEvent(event: GoogleEvent): CalendarEvent | null {
  const sourceKey = event.extendedProperties?.private?.sourceKey;
  const managedSource = event.extendedProperties?.private?.source;

  if (!event.id || !sourceKey || !managedSource) {
    return null;
  }

  return {
    id: event.id,
    sourceKey,
    title: event.summary || "",
    startDateTime: stripOffset(event.start?.dateTime || ""),
    endDateTime: stripOffset(event.end?.dateTime || ""),
    timeZone: event.start?.timeZone || "",
    managedSource
  };
}

async function googleTokenRequest(params: Record<string, string>): Promise<GoogleTokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });

  return readGoogleResponse<GoogleTokenResponse>(response);
}

async function googleFetchJson<T>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (response.status === 204) {
    return {} as T;
  }

  return readGoogleResponse<T>(response);
}

async function readGoogleResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`Google API error ${response.status}: ${JSON.stringify(data)}`);
  }

  return data as T;
}

function stripOffset(value: string): string {
  return value.replace(/(?:Z|[+-]\d{2}:\d{2})$/, "");
}
