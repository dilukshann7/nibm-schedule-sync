import type { SyncPlan } from "./types.js";

export function limitSyncPlan(plan: SyncPlan, maxOperations: number): {
  limitedPlan: SyncPlan;
  operationCount: number;
  hasMore: boolean;
} {
  const limitedPlan: SyncPlan = {
    toCreate: [],
    toUpdate: [],
    toDelete: []
  };
  let remaining = maxOperations;

  limitedPlan.toUpdate = plan.toUpdate.slice(0, remaining);
  remaining -= limitedPlan.toUpdate.length;

  if (remaining > 0) {
    limitedPlan.toDelete = plan.toDelete.slice(0, remaining);
    remaining -= limitedPlan.toDelete.length;
  }

  if (remaining > 0) {
    limitedPlan.toCreate = plan.toCreate.slice(0, remaining);
    remaining -= limitedPlan.toCreate.length;
  }

  const operationCount = maxOperations - remaining;
  const totalOperations = plan.toCreate.length + plan.toUpdate.length + plan.toDelete.length;

  return {
    limitedPlan,
    operationCount,
    hasMore: totalOperations > operationCount
  };
}
