import * as XLSX from "xlsx";
import type { DesiredEvent } from "./types.js";

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12"
};

export type SheetRow = Array<string | number | Date | null | undefined>;

export function parseWorkbook(buffer: Buffer, timeZone: string, startTime: string, endTime: string): DesiredEvent[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("The workbook does not contain any sheets.");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, {
    header: 1,
    raw: false,
    blankrows: false
  });

  return parseScheduleRows(rows, timeZone, startTime, endTime);
}

export function parseScheduleRows(rows: SheetRow[], timeZone: string, startTime: string, endTime: string): DesiredEvent[] {
  const eventsBySourceKey = new Map<string, DesiredEvent>();

  for (const row of rows) {
    const date = parseDateCell(row[0]);

    if (!date) {
      continue;
    }

    for (const cellText of getScheduleTextCandidates(row)) {
      const moduleName = shouldSkipScheduleCell(cellText) ? "" : normalizeModuleName(cellText);

      if (!moduleName) {
        continue;
      }

      const sourceKey = `${date}|${moduleName}`;

      if (!eventsBySourceKey.has(sourceKey)) {
        eventsBySourceKey.set(sourceKey, {
          sourceKey,
          title: moduleName,
          date,
          startDateTime: `${date}T${startTime}:00`,
          endDateTime: `${date}T${endTime}:00`,
          timeZone
        });
      }
    }
  }

  return [...eventsBySourceKey.values()].sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date);
    return dateCompare === 0 ? left.title.localeCompare(right.title) : dateCompare;
  });
}

function shouldSkipScheduleCell(value: string): boolean {
  return /\b(postponed|cancelled|canceled)\b/i.test(value);
}

function getScheduleTextCandidates(row: SheetRow): string[] {
  const firstNameColumn = String(row[1] ?? "").trim();
  const secondNameColumn = String(row[2] ?? "").trim();
  const candidates: string[] = [];
  const nameColumnsText = [firstNameColumn, secondNameColumn].filter(Boolean).join(" - ");

  if (nameColumnsText && !shouldSkipScheduleCell(nameColumnsText)) {
    candidates.push(nameColumnsText, firstNameColumn, secondNameColumn);
  }

  for (const cell of row.slice(3)) {
    candidates.push(String(cell ?? ""));
  }

  return candidates;
}

export function normalizeModuleName(value: string): string {
  const moduleName = value
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d{1,2}(?::|\.)\d{2}\s*(?:am|pm)?\s*-\s*\d{1,2}(?::|\.)\d{2}\s*(?:am|pm)?\b/gi, " ")
    .split(/\s+-\s+/)[0]
    .replace(/\s+/g, " ")
    .trim();

  return isScheduleDetailOnly(moduleName) ? "" : moduleName;
}

function isScheduleDetailOnly(value: string): boolean {
  return /^(?:day\s+\d+\s+)?(?:session\s+\d+|lecture)$/i.test(value) || /^(?:mr|ms|mrs|dr)\.?\s+/i.test(value);
}

function parseDateCell(value: SheetRow[number]): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialDateToIsoDate(value);
  }

  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return excelSerialDateToIsoDate(Number(text));
  }

  const match = text.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i);

  if (!match) {
    return null;
  }

  const [, monthName, day, year] = match;
  const month = MONTHS[monthName.toLowerCase()];

  if (!month) {
    return null;
  }

  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function excelSerialDateToIsoDate(serialDate: number): string | null {
  if (serialDate < 1) {
    return null;
  }

  const excelEpoch = Date.UTC(1899, 11, 30);
  const date = new Date(excelEpoch + Math.floor(serialDate) * 86400000);
  return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}
