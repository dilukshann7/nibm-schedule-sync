import { MANAGED_SOURCE, type CalendarEvent, type DesiredEvent, type SyncPlan } from "./types.js";

export function planCalendarSync(desiredEvents: DesiredEvent[], existingEvents: CalendarEvent[]): SyncPlan {
  const managedExistingEvents = existingEvents.filter((event) => event.managedSource === MANAGED_SOURCE);
  const existingBySourceKey = new Map(managedExistingEvents.map((event) => [event.sourceKey, event]));
  const desiredBySourceKey = new Map(desiredEvents.map((event) => [event.sourceKey, event]));
  const toCreate: DesiredEvent[] = [];
  const toUpdate: SyncPlan["toUpdate"] = [];
  const toDelete: string[] = [];

  for (const desired of desiredEvents) {
    const existing = existingBySourceKey.get(desired.sourceKey);

    if (!existing) {
      toCreate.push(desired);
      continue;
    }

    if (eventChanged(existing, desired)) {
      toUpdate.push({
        id: existing.id,
        event: desired
      });
    }
  }

  for (const existing of managedExistingEvents) {
    if (!desiredBySourceKey.has(existing.sourceKey)) {
      toDelete.push(existing.id);
    }
  }

  return { toCreate, toUpdate, toDelete };
}

function eventChanged(existing: CalendarEvent, desired: DesiredEvent): boolean {
  return (
    existing.metadataMissing === true ||
    existing.title !== desired.title ||
    existing.startDateTime !== desired.startDateTime ||
    existing.endDateTime !== desired.endDateTime ||
    existing.timeZone !== desired.timeZone
  );
}
