import { beforeEach, describe, expect, test, vi } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";

let repository = createInMemoryExecutionRepository({ idFactory: () => "approval-1" });

vi.mock("../lib/execution/execution-repository-factory", () => ({
  createExecutionRepository: () => repository,
}));

import { GET, POST } from "../app/api/approvals/route";

describe("/api/approvals", () => {
  beforeEach(() => {
    repository = createInMemoryExecutionRepository({ idFactory: () => "approval-1" });
  });

  test("lists persisted approval requests", async () => {
    await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: { type: "shopify_product", id: "product-1" },
      riskLevel: 3,
      payloadSummary: "Update product copy.",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      approvals: [
        {
          id: "approval-1",
          status: "pending",
          actionType: "shopify.product.update",
        },
      ],
    });
  });

  test("records an approval decision", async () => {
    await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: { type: "shopify_product", id: "product-1" },
      riskLevel: 3,
      payloadSummary: "Update product copy.",
    });

    const response = await POST(
      new Request("http://localhost/api/approvals", {
        method: "POST",
        body: JSON.stringify({
          approvalId: "approval-1",
          status: "approved",
          result: "Approved by founder.",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      approval: { id: "approval-1", status: "approved", result: "Approved by founder." },
    });
  });

  test("rejects malformed approval decisions", async () => {
    const response = await POST(
      new Request("http://localhost/api/approvals", {
        method: "POST",
        body: JSON.stringify({ approvalId: "approval-1", status: "maybe" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "approvalId, status, and result are required; status must be approved or rejected",
    });
  });
});
