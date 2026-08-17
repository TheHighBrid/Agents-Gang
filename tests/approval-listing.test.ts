import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";

describe("approval listing", () => {
  test("returns approvals newest first, including pending and decided records", async () => {
    let now = new Date("2026-08-17T10:00:00.000Z");
    const repository = createInMemoryExecutionRepository({
      clock: () => now,
      idFactory: (() => {
        let index = 0;
        return () => `approval-${++index}`;
      })(),
    });

    await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "publish_product",
      target: { type: "product", id: "old" },
      riskLevel: 3,
      payloadSummary: "Publish old product",
    });
    now = new Date("2026-08-17T10:05:00.000Z");
    const newest = await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "publish_product",
      target: { type: "product", id: "new" },
      riskLevel: 3,
      payloadSummary: "Publish new product",
    });
    await repository.decideApproval({
      approvalId: newest.id,
      status: "approved",
      result: "Approved by owner",
    });

    const approvals = await repository.listApprovals();

    expect(approvals.map((approval) => approval.id)).toEqual(["approval-2", "approval-1"]);
    expect(approvals[0]?.status).toBe("approved");
    expect(approvals[1]?.status).toBe("pending");
  });
});

test("filters and cursor-paginates approvals with a deterministic tie-breaker", async () => {
  const repository = createInMemoryExecutionRepository({
    clock: () => new Date("2026-08-17T10:00:00.000Z"),
    idFactory: (() => { let id = 0; return () => `approval-${++id}`; })(),
  });
  for (const actionType of ["publish", "publish", "delete"]) {
    await repository.createApproval({
      requestingAgent: "agent", actionType, target: { type: "product", id: actionType },
      riskLevel: 3, payloadSummary: "safe summary",
    });
  }
  const first = await repository.queryApprovals({ actionType: "publish", limit: 1 });
  expect(first.approvals.map(({ id }) => id)).toEqual(["approval-2"]);
  expect(first.nextCursor).toBeTypeOf("string");
  const second = await repository.queryApprovals({ actionType: "publish", limit: 1, cursor: first.nextCursor });
  expect(second.approvals.map(({ id }) => id)).toEqual(["approval-1"]);
  expect(second.nextCursor).toBeUndefined();
});
