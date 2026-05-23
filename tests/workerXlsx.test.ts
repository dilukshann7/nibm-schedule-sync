import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseWorkbookForWorker } from "../src/workerXlsx.js";

function workbookZip(): ArrayBuffer {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
      </Types>`),
    "xl/workbook.xml": strToU8("<workbook />"),
    "xl/sharedStrings.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <si><t>Tuesday, May 26, 2026</t></si>
        <si><t>Robotics - Mr. Supun</t></si>
        <si><t>Robotics - Mr. Supun ( 1.00pm - 3.00pm)</t></si>
        <si><t>Wednesday, May 27, 2026</t></si>
        <si><t>MAD - Ishara Dissanayake</t></si>
      </sst>`),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1">
            <c r="A1" t="s"><v>0</v></c>
            <c r="B1" t="s"><v>1</v></c>
            <c r="C1" t="s"><v>2</v></c>
          </row>
          <row r="2">
            <c r="A2" t="s"><v>3</v></c>
            <c r="B2" t="s"><v>4</v></c>
          </row>
        </sheetData>
      </worksheet>`)
  };

  const zipped = zipSync(files);
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
}

describe("parseWorkbookForWorker", () => {
  it("parses xlsx XML without the Node xlsx package", () => {
    expect(parseWorkbookForWorker(workbookZip(), "Asia/Colombo", "09:00", "16:00")).toEqual([
      {
        sourceKey: "2026-05-26|Robotics",
        title: "Robotics",
        date: "2026-05-26",
        startDateTime: "2026-05-26T09:00:00",
        endDateTime: "2026-05-26T16:00:00",
        timeZone: "Asia/Colombo"
      },
      {
        sourceKey: "2026-05-27|MAD",
        title: "MAD",
        date: "2026-05-27",
        startDateTime: "2026-05-27T09:00:00",
        endDateTime: "2026-05-27T16:00:00",
        timeZone: "Asia/Colombo"
      }
    ]);
  });
});
