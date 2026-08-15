import { describe, expect, test } from "vitest";

import { createApprovalRequest } from "../tools/approvals";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";

describe("approval tool", () => {
  test("creates a persisted approval request for a level-3 action", async () => {
    const repository = createInMemoryExecutionRepository({
      idFactory: () => "approval-1",
      clock: () => new Date("2026-08-15T12:00:00.000Z"),
    });

    const approval = await createApprovalRequest(repository, {
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: { type: "shopify_product", id: "gid://shopify/Product/123" },
      riskLevel: 3,
      payloadSummary: "Update product description.",
    });

    expect(approval).toMatchObject({
      id: "approval-1",
      status: "pending",
      actionType: "shopify.product.update",
      riskLevel: 3,
    });
  });
});
