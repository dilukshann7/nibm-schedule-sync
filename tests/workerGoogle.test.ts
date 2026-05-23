import { describe, expect, it } from "vitest";
import { toGoogleEventBody, fromGoogleEvent } from "../src/workerGoogle.js";
import { MANAGED_SOURCE, type DesiredEvent } from "../src/types.js";

const event: DesiredEvent = {
  sourceKey: "2026-05-26|Robotics",
  title: "Robotics",
  date: "2026-05-26",
  startDateTime: "2026-05-26T09:00:00",
  endDateTime: "2026-05-26T16:00:00",
  timeZone: "Asia/Colombo"
};

describe("toGoogleEventBody", () => {
  it("marks events as managed by this sync service", () => {
    expect(toGoogleEventBody(event)).toEqual({
      summary: "Robotics",
      start: { dateTime: "2026-05-26T09:00:00", timeZone: "Asia/Colombo" },
      end: { dateTime: "2026-05-26T16:00:00", timeZone: "Asia/Colombo" },
      extendedProperties: {
        private: {
          source: MANAGED_SOURCE,
          sourceKey: "2026-05-26|Robotics"
        }
      }
    });
  });
});

describe("fromGoogleEvent", () => {
  it("maps Google events back to sync planner input", () => {
    expect(
      fromGoogleEvent({
        id: "google-event-id",
        summary: "Robotics",
        start: { dateTime: "2026-05-26T09:00:00+05:30", timeZone: "Asia/Colombo" },
        end: { dateTime: "2026-05-26T16:00:00+05:30", timeZone: "Asia/Colombo" },
        extendedProperties: {
          private: {
            source: MANAGED_SOURCE,
            sourceKey: "2026-05-26|Robotics"
          }
        }
      })
    ).toEqual({
      id: "google-event-id",
      sourceKey: "2026-05-26|Robotics",
      title: "Robotics",
      startDateTime: "2026-05-26T09:00:00",
      endDateTime: "2026-05-26T16:00:00",
      timeZone: "Asia/Colombo",
      managedSource: MANAGED_SOURCE
    });
  });
});
