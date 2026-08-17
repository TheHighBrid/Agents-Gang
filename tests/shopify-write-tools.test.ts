import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { createApprovalRequest } from "../tools/approvals";
import {
  runShopifyProductCreate,
  runShopifyProductUpdate,
} from "../tools/shopify-write-tools";

async function approve(
  repository: ReturnType<typeof createInMemoryExecutionRepository>,
  actionType: string,
  targetId = "new",
) {
  const request = await createApprovalRequest(repository, {
    requestingAgent: "shopify_ops_agent",
    actionType,
    target: { type: "shopify_product", id: targetId },
    riskLevel: 3,
    payloadSummary: "Approved Shopify product write.",
  });
  return repository.decideApproval({
    approvalId: request.id,
    status: "approved",
    result: "Approved.",
  });
}

describe("Shopify write tools", () => {
  test("creates a product only when a matching approval is supplied", async () => {
    const repository = createInMemoryExecutionRepository();
    const approval = await approve(repository, "shopify.product.create");
    let received: unknown;

    const result = await runShopifyProductCreate(
      {
        repository,
        runId: "run-create",
        agentName: "shopify_ops_agent",
        approvalId: approval.id,
      },
      { title: "Satin Track Pant", status: "DRAFT" },
      async (input) => {
        received = input;
        return { product: { id: "gid://shopify/Product/1" } };
      },
    );

    expect(result).toEqual({
      ok: true,
      data: { product: { id: "gid://shopify/Product/1" } },
    });
    expect(received).toEqual({ title: "Satin Track Pant", status: "DRAFT" });
  });

  test("blocks an unapproved product update before invoking Shopify", async () => {
    const repository = createInMemoryExecutionRepository();
    let calls = 0;

    const result = await runShopifyProductUpdate(
      {
        repository,
        runId: "run-update-blocked",
        agentName: "shopify_ops_agent",
      },
      { productId: "gid://shopify/Product/1", title: "Updated title" },
      async () => {
        calls += 1;
        return { updated: true };
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "approval_required" },
    });
    expect(calls).toBe(0);
  });

  test("updates a product after approval for the exact product target", async () => {
    const repository = createInMemoryExecutionRepository();
    const productId = "gid://shopify/Product/1";
    const approval = await approve(repository, "shopify.product.update", productId);

    const result = await runShopifyProductUpdate(
      {
        repository,
        runId: "run-update",
        agentName: "shopify_ops_agent",
        approvalId: approval.id,
      },
      { productId, descriptionHtml: "<p>Updated description.</p>" },
      async (input) => ({ updated: input }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        updated: {
          productId,
          descriptionHtml: "<p>Updated description.</p>",
        },
      },
    });
  });

  test("rejects an update without mutable product fields", async () => {
    const repository = createInMemoryExecutionRepository();
    const productId = "gid://shopify/Product/1";
    const approval = await approve(repository, "shopify.product.update", productId);
    const result = await runShopifyProductUpdate(
      {
        repository,
        runId: "run-update-invalid",
        agentName: "shopify_ops_agent",
        approvalId: approval.id,
      },
      { productId },
      async () => ({ updated: true }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
  });
});
