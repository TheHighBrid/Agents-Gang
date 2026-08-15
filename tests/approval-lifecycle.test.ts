import { describe, expect, test } from "vitest";

import { createInMemoryExecutionRepository } from "../lib/execution/repository";

describe("approval lifecycle", () => {
  test("records a complete pending approval request", async () => {
    const repository = createInMemoryExecutionRepository({
      clock: () => new Date("2026-08-15T12:00:00.000Z"),
      idFactory: () => "approval-1",
    });

    const approval = await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: {
        type: "shopify_product",
        id: "gid://shopify/Product/123",
      },
      riskLevel: 3,
      payloadSummary: "Update product description for OVUM Satin Track Pant.",
    });

    expect(approval).toMatchObject({
      id: "approval-1",
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: {
        type: "shopify_product",
        id: "gid://shopify/Product/123",
      },
      riskLevel: 3,
      payloadSummary: "Update product description for OVUM Satin Track Pant.",
      status: "pending",
      requestedAt: "2026-08-15T12:00:00.000Z",
      updatedAt: "2026-08-15T12:00:00.000Z",
    });
  });

  test("records an explicit approval decision and result", async () => {
    const timestamps = [
      new Date("2026-08-15T12:00:00.000Z"),
      new Date("2026-08-15T12:05:00.000Z"),
    ];
    const repository = createInMemoryExecutionRepository({
      clock: () => timestamps.shift()!,
      idFactory: () => "approval-1",
    });
    const requested = await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: { type: "shopify_product", id: "gid://shopify/Product/123" },
      riskLevel: 3,
      payloadSummary: "Update product description.",
    });

    const approved = await repository.decideApproval({
      approvalId: requested.id,
      status: "approved",
      result: "Approved by Mohamed after copy review.",
    });

    expect(approved).toMatchObject({
      id: requested.id,
      status: "approved",
      result: "Approved by Mohamed after copy review.",
      decidedAt: "2026-08-15T12:05:00.000Z",
      updatedAt: "2026-08-15T12:05:00.000Z",
    });
  });
});
