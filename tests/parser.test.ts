import { describe, expect, it } from "vitest";
import { parseScheduleRows, normalizeModuleName } from "../src/parser.js";

describe("normalizeModuleName", () => {
  it("strips lecturers, brackets, session labels, and times", () => {
    expect(normalizeModuleName("Robotics - Mr. Supun ( 1.00pm - 3.00pm)")).toBe("Robotics");
    expect(normalizeModuleName("MAD - Ishara Dissanayake")).toBe("MAD");
    expect(normalizeModuleName("ECS II - Day 4 Session 1 [Ms. Bhagya Hapuarachchi]")).toBe("ECS II");
    expect(normalizeModuleName("EAD2 - Lecture [Mr. Lahiru] 9:00 am - 12:00 pm")).toBe("EAD2");
    expect(normalizeModuleName("ITMP - Ms. Amila ")).toBe("ITMP");
  });
});

describe("parseScheduleRows", () => {
  it("extracts dates, skips blanks, and deduplicates same module on same date", () => {
    const rows = [
      ["Tuesday, May 26, 2026", "Robotics - Mr. Supun", "Robotics - Mr. Supun ( 1.00pm - 3.00pm)"],
      ["Wednesday, May 27, 2026", "MAD - Ishara Dissanayake", "MAD - Ishara Dissanayake"],
      ["Thursday, May 28, 2026", "", ""]
    ];

    expect(parseScheduleRows(rows, "Asia/Colombo", "09:00", "16:00")).toEqual([
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

  it("creates separate events for different modules on the same date", () => {
    const rows = [["Saturday, June 6, 2026", "EAD2 - Lecture [Mr. Lahiru] 9:00 am - 12:00 pm", "MAD - Ishara Dissanayake"]];

    expect(parseScheduleRows(rows, "Asia/Colombo", "09:00", "16:00").map((event) => event.sourceKey)).toEqual([
      "2026-06-06|EAD2",
      "2026-06-06|MAD"
    ]);
  });

  it("reads lecture names from either B or C and joins split B/C details", () => {
    const rows = [
      ["Friday, May 29, 2026", "ECS II", "Day 4 Session 1 [Ms. Bhagya Hapuarachchi]"],
      ["Saturday, May 30, 2026", "", "EAD2 - Lecture [Mr. Lahiru]"],
      ["Sunday, May 31, 2026", "ITMP - Ms. Amila", ""],
      ["Monday, June 1, 2026", "", "", "Robotics - Mr. Supun", "MAD - Ishara Dissanayake"]
    ];

    expect(parseScheduleRows(rows, "Asia/Colombo", "09:00", "16:00").map((event) => event.sourceKey)).toEqual([
      "2026-05-29|ECS II",
      "2026-05-30|EAD2",
      "2026-05-31|ITMP"
    ]);
  });

  it("accepts Excel serial dates from raw workbook XML", () => {
    const rows = [[46168, "Robotics - Mr. Supun"]];

    expect(parseScheduleRows(rows, "Asia/Colombo", "09:00", "16:00").map((event) => event.sourceKey)).toEqual([
      "2026-05-26|Robotics"
    ]);
  });

  it("skips postponed, cancelled, rescheduled, and online schedule cells", () => {
    const rows = [
      ["Tuesday, May 26, 2026", "Robotics - postponed", "MAD - cancelled"],
      ["Wednesday, May 27, 2026", "MAD - Ishara Dissanayake - Rescheduled", "MAD - Ishara Dissanayake - Rescheduled"],
      ["Thursday, May 28, 2026", "Robotics - Online Mr. Supun ( 1.00pm - 4.00pm) - Project Components Finalizing", ""],
      ["Friday, May 29, 2026", "ECS II - Day 1 Session 1 [Ms. Bhagya]", ""]
    ];

    expect(parseScheduleRows(rows, "Asia/Colombo", "09:00", "16:00").map((event) => event.sourceKey)).toEqual([
      "2026-05-29|ECS II"
    ]);
  });

  it("syncs exam rows with their explicit exam time", () => {
    const rows = [
      ["Monday, September 21, 2026", "", "Statistics for Computing - Final Examination - 1.00pm - 4.00pm"],
      ["Wednesday, September 23, 2026", "", "DM 2- Exam 1.00pm-4.00pm"],
      ["Wednesday, July 1, 2026", "", "ITMP - Final Examination 1.00pm- 4.00pm - scheduled"]
    ];

    expect(parseScheduleRows(rows, "Asia/Colombo", "09:00", "16:00")).toEqual([
      {
        sourceKey: "2026-07-01|ITMP - Final Examination",
        title: "ITMP - Final Examination",
        date: "2026-07-01",
        startDateTime: "2026-07-01T13:00:00",
        endDateTime: "2026-07-01T16:00:00",
        timeZone: "Asia/Colombo"
      },
      {
        sourceKey: "2026-09-21|Statistics for Computing - Final Examination",
        title: "Statistics for Computing - Final Examination",
        date: "2026-09-21",
        startDateTime: "2026-09-21T13:00:00",
        endDateTime: "2026-09-21T16:00:00",
        timeZone: "Asia/Colombo"
      },
      {
        sourceKey: "2026-09-23|DM 2 - Exam",
        title: "DM 2 - Exam",
        date: "2026-09-23",
        startDateTime: "2026-09-23T13:00:00",
        endDateTime: "2026-09-23T16:00:00",
        timeZone: "Asia/Colombo"
      }
    ]);
  });
});
