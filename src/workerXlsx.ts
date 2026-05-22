import { unzipSync } from "fflate";
import { parseScheduleRows, type SheetRow } from "./parser.js";
import type { DesiredEvent } from "./types.js";

const textDecoder = new TextDecoder();

export function parseWorkbookForWorker(arrayBuffer: ArrayBuffer, timeZone: string, startTime: string, endTime: string): DesiredEvent[] {
  const zip = unzipSync(new Uint8Array(arrayBuffer));
  const sheet = readRequiredZipText(zip, "xl/worksheets/sheet1.xml");
  const sharedStrings = readSharedStrings(zip["xl/sharedStrings.xml"]);
  const rows = readSheetRows(sheet, sharedStrings);

  return parseScheduleRows(rows, timeZone, startTime, endTime);
}

function readRequiredZipText(zip: Record<string, Uint8Array>, path: string): string {
  const bytes = zip[path];

  if (!bytes) {
    throw new Error(`Workbook is missing ${path}.`);
  }

  return textDecoder.decode(bytes);
}

function readSharedStrings(bytes?: Uint8Array): string[] {
  if (!bytes) {
    return [];
  }

  const xml = textDecoder.decode(bytes);
  const strings: string[] = [];
  const sharedStringPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;

  for (const match of xml.matchAll(sharedStringPattern)) {
    const textParts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((textMatch) => decodeXml(textMatch[1]));
    strings.push(textParts.join(""));
  }

  return strings;
}

function readSheetRows(sheetXml: string, sharedStrings: string[]): SheetRow[] {
  const rows: SheetRow[] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;

  for (const rowMatch of sheetXml.matchAll(rowPattern)) {
    const row: SheetRow = [];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;

    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const reference = attributes.match(/\br="([A-Z]+\d+)"/)?.[1];
      const columnIndex = reference ? columnNameToIndex(reference.replace(/\d+$/, "")) : row.length;
      row[columnIndex] = readCellValue(attributes, body, sharedStrings);
    }

    rows.push(row);
  }

  return rows;
}

function readCellValue(attributes: string, body: string, sharedStrings: string[]): string {
  const type = attributes.match(/\bt="([^"]+)"/)?.[1];

  if (type === "inlineStr") {
    return decodeXml([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join(""));
  }

  const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";

  if (type === "s") {
    return sharedStrings[Number(rawValue)] ?? "";
  }

  return decodeXml(rawValue);
}

function columnNameToIndex(columnName: string): number {
  let index = 0;

  for (const char of columnName) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }

  return index - 1;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
