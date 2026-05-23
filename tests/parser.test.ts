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

    expect(parseScheduleRows(rows, "Asia/Colombo", "09:00", "17:00").map((event) => event.sourceKey)).toEqual([
      "2026-06-06|EAD2",
      "2026-06-06|MAD"
    ]);
  });
});
