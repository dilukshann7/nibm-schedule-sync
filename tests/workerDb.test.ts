import { describe, expect, it } from "vitest";
import { createSyncJob, getNextPendingSyncJob } from "../src/workerDb.js";

type JobRow = {
  id: string;
  user_id: string;
  desired_events: string;
  status: string;
  created_at: string;
  updated_at: string;
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
          if (sql.includes("UPDATE sync_jobs") && sql.includes("desired_events")) {
            const [desiredEvents, userId] = this.values as [string, string];
            const job = jobs.find((item) => item.user_id === userId && item.status === "pending");

            if (job) {
              job.desired_events = desiredEvents;
              job.updated_at = "2026-05-26 09:00:00";
              return { meta: { changes: 1 } };
            }

            return { meta: { changes: 0 } };
          }

          if (sql.includes("UPDATE sync_jobs") && sql.includes("created_at = CURRENT_TIMESTAMP")) {
            const [jobId] = this.values as [string];
            const job = jobs.find((item) => item.id === jobId);

            if (job) {
              job.created_at = "2026-05-26 10:00:00";
              job.updated_at = "2026-05-26 10:00:00";
              return { meta: { changes: 1 } };
            }

            return { meta: { changes: 0 } };
          }

          if (sql.startsWith("INSERT INTO sync_jobs")) {
            const [id, userId, desiredEvents] = this.values as [string, string, string];
            jobs.push({
              id,
              user_id: userId,
              desired_events: desiredEvents,
              status: "pending",
              created_at: `2026-05-26 0${jobs.length + 6}:00:00`,
              updated_at: `2026-05-26 0${jobs.length + 6}:00:00`
            });
            return { meta: { changes: 1 } };
          }

          throw new Error(`Unexpected SQL: ${sql}`);
        },
        async first() {
          if (sql.startsWith("SELECT * FROM sync_jobs WHERE status = 'pending'")) {
            return [...jobs]
              .filter((item) => item.status === "pending")
              .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null;
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

  it("rotates an unfinished pending job behind other pending accounts", async () => {
    const { db } = createFakeDb();
    const { deferSyncJob } = await import("../src/workerDb.js");

    await createSyncJob(db, "user-1", JSON.stringify([{ sourceKey: "2026-05-26|MAD" }]));
    await createSyncJob(db, "user-2", JSON.stringify([{ sourceKey: "2026-05-26|MAD" }]));

    const first = await getNextPendingSyncJob(db);
    expect(first?.user_id).toBe("user-1");

    await deferSyncJob(db, first!.id);

    expect((await getNextPendingSyncJob(db))?.user_id).toBe("user-2");
  });
});
