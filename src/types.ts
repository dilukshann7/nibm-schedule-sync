export const MANAGED_SOURCE = "nibm-excel-calendar-sync";

export type DesiredEvent = {
  sourceKey: string;
  title: string;
  date: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
};

export type CalendarEvent = {
  id: string;
  sourceKey: string;
  title: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
  managedSource: string;
};

export type SyncPlan = {
  toCreate: DesiredEvent[];
  toUpdate: Array<{
    id: string;
    event: DesiredEvent;
  }>;
  toDelete: string[];
};
