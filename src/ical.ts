import type { DesiredEvent } from "./types.js";

const CALENDAR_PRODID = "-//NIBM Calendar Sync//EN";
const SOURCE_DOMAIN = "nibm-calendar-sync";

export function buildIcsCalendar(
  events: DesiredEvent[],
  calendarName: string,
  timeZone: string,
  generatedAt: Date = new Date()
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${CALENDAR_PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `X-WR-TIMEZONE:${escapeIcsText(timeZone)}`
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(`${event.sourceKey}@${SOURCE_DOMAIN}`)}`,
      `DTSTAMP:${formatUtcDateTime(generatedAt)}`,
      `DTSTART;TZID=${timeZone}:${formatLocalDateTime(event.startDateTime)}`,
      `DTEND;TZID=${timeZone}:${formatLocalDateTime(event.endDateTime)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      "SEQUENCE:0",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

function formatLocalDateTime(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid calendar date-time: ${value}`);
  }

  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}${match[6]}`;
}

function formatUtcDateTime(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let limit = 75;

  for (const character of line) {
    if (current && encoder.encode(current + character).length > limit) {
      parts.push(current);
      current = character;
      limit = 74;
    } else {
      current += character;
    }
  }

  parts.push(current);
  return parts.join("\r\n ");
}
