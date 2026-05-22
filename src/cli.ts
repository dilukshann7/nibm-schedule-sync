import { loadConfig } from "./config.js";
import { downloadExcel } from "./excel.js";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getAuthorizedCalendar,
  getOrCreateCalendarId,
  listManagedEvents,
  runAuth,
  updateCalendarEvent
} from "./googleCalendar.js";
import { parseWorkbook } from "./parser.js";
import { planCalendarSync } from "./syncPlanner.js";

async function main(): Promise<void> {
  const command = process.argv[2];
  const config = loadConfig();

  if (command === "auth") {
    await runAuth(config);
    return;
  }

  if (command === "sync") {
    await runSync(config);
    return;
  }

  throw new Error("Unknown command. Use `npm run auth` or `npm run sync`.");
}

async function runSync(config: ReturnType<typeof loadConfig>): Promise<void> {
  const excelBuffer = await downloadExcel(config.sharepointExcelUrl);
  const desiredEvents = parseWorkbook(excelBuffer, config.timeZone, config.eventStart, config.eventEnd);
  const calendar = await getAuthorizedCalendar(config);
  const calendarId = await getOrCreateCalendarId(calendar, config.googleCalendarName, config.timeZone);
  const existingEvents = await listManagedEvents(calendar, calendarId);
  const plan = planCalendarSync(desiredEvents, existingEvents);

  for (const event of plan.toCreate) {
    await createCalendarEvent(calendar, calendarId, event);
  }

  for (const update of plan.toUpdate) {
    await updateCalendarEvent(calendar, calendarId, update.id, update.event);
  }

  for (const id of plan.toDelete) {
    await deleteCalendarEvent(calendar, calendarId, id);
  }

  console.log(`Parsed ${desiredEvents.length} event(s).`);
  console.log(`Created ${plan.toCreate.length}, updated ${plan.toUpdate.length}, deleted ${plan.toDelete.length}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
