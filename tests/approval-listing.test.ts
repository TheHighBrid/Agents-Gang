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
