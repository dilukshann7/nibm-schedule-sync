import { describe, expect, it } from "vitest";
import { planCalendarSync } from "../src/syncPlanner.js";
import { MANAGED_SOURCE, type CalendarEvent, type DesiredEvent } from "../src/types.js";

const desired = (sourceKey: string, title: string, date = "2026-05-26"): DesiredEvent => ({
  sourceKey,
  title,
  date,
  startDateTime: `${date}T09:00:00`,
  endDateTime: `${date}T17:00:00`,
  timeZone: "Asia/Colombo"
});

const existing = (id: string, sourceKey: string, title: string, date = "2026-05-26", managed = true): CalendarEvent => ({
  id,
  sourceKey,
  title,
  startDateTime: `${date}T09:00:00`,
  endDateTime: `${date}T17:00:00`,
  timeZone: "Asia/Colombo",
  managedSource: managed ? MANAGED_SOURCE : "other"
});

describe("planCalendarSync", () => {
  it("creates missing events", () => {
    const plan = planCalendarSync([desired("2026-05-26|Robotics", "Robotics")], []);

    expect(plan.toCreate.map((event) => event.sourceKey)).toEqual(["2026-05-26|Robotics"]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it("updates existing managed events when title or time data changes", () => {
    const plan = planCalendarSync(
      [desired("2026-05-26|Robotics", "Robotics", "2026-05-27")],
      [existing("google-1", "2026-05-26|Robotics", "Old Robotics")]
    );

    expect(plan.toUpdate).toEqual([
      {
        id: "google-1",
        event: desired("2026-05-26|Robotics", "Robotics", "2026-05-27")
      }
    ]);
  });

  it("deletes stale managed events only", () => {
    const plan = planCalendarSync(
      [desired("2026-05-26|Robotics", "Robotics")],
      [
        existing("stale-managed", "2026-05-27|MAD", "MAD"),
        existing("personal-event", "2026-05-28|Personal", "Personal", "2026-05-28", false)
      ]
    );

    expect(plan.toDelete).toEqual(["stale-managed"]);
  });

  it("ignores non-managed events that share a source key", () => {
    const plan = planCalendarSync(
      [desired("2026-05-26|Robotics", "Robotics")],
      [existing("personal-event", "2026-05-26|Robotics", "Robotics", "2026-05-26", false)]
    );

    expect(plan.toCreate.map((event) => event.sourceKey)).toEqual(["2026-05-26|Robotics"]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });
});
