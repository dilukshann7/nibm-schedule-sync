import { describe, expect, it } from "vitest";
import { buildIcsCalendar } from "../src/ical.js";
import type { DesiredEvent } from "../src/types.js";

const generatedAt = new Date("2026-08-07T12:34:56.000Z");

function event(overrides: Partial<DesiredEvent> = {}): DesiredEvent {
  return {
    sourceKey: "2026-08-07|Robotics",
    title: "Robotics",
    date: "2026-08-07",
    startDateTime: "2026-08-07T09:00:00",
    endDateTime: "2026-08-07T16:00:00",
    timeZone: "Asia/Colombo",
    ...overrides
  };
}

describe("buildIcsCalendar", () => {
  it("creates a Colombo-local calendar with stable event metadata", () => {
    const first = buildIcsCalendar([event()], "NIBM Schedule", "Asia/Colombo", generatedAt);
    const second = buildIcsCalendar([event()], "NIBM Schedule", "Asia/Colombo", generatedAt);

    expect(first).toBe(second);
    expect(first).toContain("BEGIN:VCALENDAR\r\n");
    expect(first).toContain("VERSION:2.0\r\n");
    expect(first).toContain("X-WR-CALNAME:NIBM Schedule\r\n");
    expect(first).toContain("X-WR-TIMEZONE:Asia/Colombo\r\n");
    expect(first).toContain("UID:2026-08-07|Robotics@nibm-calendar-sync\r\n");
    expect(first).toContain("DTSTAMP:20260807T123456Z\r\n");
    expect(first).toContain("DTSTART;TZID=Asia/Colombo:20260807T090000\r\n");
    expect(first).toContain("DTEND;TZID=Asia/Colombo:20260807T160000\r\n");
    expect(first).toContain("SEQUENCE:0\r\n");
    expect(first.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(first).not.toContain("\n\n");
  });

  it("escapes iCalendar text and includes multiple events with custom times", () => {
    const calendar = buildIcsCalendar(
      [
        event({ title: "Math, Data; Systems\\Lab\nExam" }),
        event({
          sourceKey: "2026-09-21|Statistics for Computing - Final Examination",
          title: "Statistics for Computing - Final Examination",
          date: "2026-09-21",
          startDateTime: "2026-09-21T13:00:00",
          endDateTime: "2026-09-21T16:00:00"
        })
      ],
      "NIBM, Schedule; 2026",
      "Asia/Colombo",
      generatedAt
    );

    expect(calendar).toContain("X-WR-CALNAME:NIBM\\, Schedule\\; 2026\r\n");
    expect(calendar).toContain("SUMMARY:Math\\, Data\\; Systems\\\\Lab\\nExam\r\n");
    expect(calendar).toContain("DTSTART;TZID=Asia/Colombo:20260921T130000\r\n");
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});
