import { describe, expect, it, vi } from "vitest";
import { toGoogleEventBody, fromGoogleEvent, listManagedEvents } from "../src/workerGoogle.js";
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

  it("treats sync-looking calendar events without metadata as legacy managed events", () => {
    expect(
      fromGoogleEvent({
        id: "legacy-google-event-id",
        summary: "ITMP",
        start: { dateTime: "2026-06-02T09:00:00+05:30", timeZone: "Asia/Colombo" },
        end: { dateTime: "2026-06-02T16:00:00+05:30", timeZone: "Asia/Colombo" }
      })
    ).toEqual({
      id: "legacy-google-event-id",
      sourceKey: "2026-06-02|ITMP",
      title: "ITMP",
      startDateTime: "2026-06-02T09:00:00",
      endDateTime: "2026-06-02T16:00:00",
      timeZone: "Asia/Colombo",
      managedSource: MANAGED_SOURCE,
      metadataMissing: true
    });
  });
});

describe("listManagedEvents", () => {
  it("does not pre-filter by private metadata so legacy events can be cleaned up", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await listManagedEvents("access-token", "calendar-1");

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.has("privateExtendedProperty")).toBe(false);
  });
});
