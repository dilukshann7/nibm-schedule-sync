import { describe, expect, it } from "vitest";
import { limitSyncPlan } from "../src/syncBatch.js";
import type { DesiredEvent, SyncPlan } from "../src/types.js";

const event = (sourceKey: string): DesiredEvent => ({
  sourceKey,
  title: sourceKey,
  date: "2026-05-26",
  startDateTime: "2026-05-26T09:00:00",
  endDateTime: "2026-05-26T16:00:00",
  timeZone: "Asia/Colombo"
});

describe("limitSyncPlan", () => {
  it("limits calendar mutations and reports when more work remains", () => {
    const plan: SyncPlan = {
      toCreate: [event("create-1"), event("create-2")],
      toUpdate: [{ id: "update-1", event: event("update-1") }],
      toDelete: ["delete-1"]
    };

    expect(limitSyncPlan(plan, 3)).toEqual({
      limitedPlan: {
        toCreate: [event("create-1"), event("create-2")],
        toUpdate: [{ id: "update-1", event: event("update-1") }],
        toDelete: []
      },
      operationCount: 3,
      hasMore: true
    });
  });
});
