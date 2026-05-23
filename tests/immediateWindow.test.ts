import { describe, expect, it } from "vitest";
import { filterEventsForImmediateWindow } from "../src/workerSync.js";
import type { DesiredEvent } from "../src/types.js";

const event = (date: string): DesiredEvent => ({
  sourceKey: `${date}|Robotics`,
  title: "Robotics",
  date,
  startDateTime: `${date}T09:00:00`,
  endDateTime: `${date}T16:00:00`,
  timeZone: "Asia/Colombo"
});

describe("filterEventsForImmediateWindow", () => {
  it("keeps only events from today through the next 35 days", () => {
    expect(
      filterEventsForImmediateWindow(
        [event("2026-05-21"), event("2026-05-22"), event("2026-06-26"), event("2026-06-27")],
        "2026-05-22",
        35
      ).map((item) => item.date)
    ).toEqual(["2026-05-22", "2026-06-26"]);
  });
});
