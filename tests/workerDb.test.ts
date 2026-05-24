import { describe, expect, it } from "vitest";
import { createSyncJob } from "../src/workerDb.js";

type JobRow = {
  id: string;
  user_id: string;
  desired_events: string;
  status: string;
};

function createFakeDb() {
  const jobs: JobRow[] = [];

  const db = {
    prepare(sql: string) {
      const statement = {
        values: [] as unknown[],
        bind(...values: unknown[]) {
          this.values = values;
          return this;
        },
        async run() {
          if (sql.startsWith("UPDATE sync_jobs")) {
            const [desiredEvents, userId] = this.values as [string, string];
            const job = jobs.find((item) => item.user_id === userId && item.status === "pending");

            if (job) {
              job.desired_events = desiredEvents;
              return { meta: { changes: 1 } };
            }

            return { meta: { changes: 0 } };
          }

          if (sql.startsWith("INSERT INTO sync_jobs")) {
            const [id, userId, desiredEvents] = this.values as [string, string, string];
            jobs.push({ id, user_id: userId, desired_events: desiredEvents, status: "pending" });
            return { meta: { changes: 1 } };
          }

          throw new Error(`Unexpected SQL: ${sql}`);
        }
      };

      return statement;
    }
  };

  return { db: db as unknown as D1Database, jobs };
}

describe("createSyncJob", () => {
  it("refreshes an existing pending job instead of queueing duplicate stale snapshots", async () => {
    const { db, jobs } = createFakeDb();

    await createSyncJob(db, "user-1", JSON.stringify([{ sourceKey: "2026-05-26|Robotics" }]));
    await createSyncJob(db, "user-1", JSON.stringify([{ sourceKey: "2026-07-01|EAD2" }]));

    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0].desired_events)).toEqual([{ sourceKey: "2026-07-01|EAD2" }]);
  });
});
