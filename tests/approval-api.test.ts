import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { getApprovalListResponse } from "../lib/approvals/approval-api";

describe("approval list response", () => {
  test("returns persisted approval requests in repository order", async () => {
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
      actionType: "shopify.product.update",
      target: { type: "shopify_product", id: "old" },
      riskLevel: 3,
      payloadSummary: "Update old product",
    });
    now = new Date("2026-08-17T10:05:00.000Z");
    await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: { type: "shopify_product", id: "new" },
      riskLevel: 4,
      payloadSummary: "Update new product",
    });

    const response = await getApprovalListResponse(repository);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      approvals: [
        { id: "approval-2", status: "pending", riskLevel: 4 },
        { id: "approval-1", status: "pending", riskLevel: 3 },
      ],
    });
  });
});
