import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { createApprovalRequest } from "../tools/approvals";
import {
  runShopifyInventoryAdjust,
  runShopifyVariantCreate,
  runShopifyVariantUpdate,
} from "../tools/shopify-inventory-variant-tools";

async function approve(
  repository: ReturnType<typeof createInMemoryExecutionRepository>,
  actionType: string,
  target: { type: string; id: string },
) {
  const request = await createApprovalRequest(repository, {
    requestingAgent: "shopify_ops_agent",
    actionType,
    target,
    riskLevel: 3,
    payloadSummary: "Approved inventory or variant write.",
  });
  return repository.decideApproval({
    approvalId: request.id,
    status: "approved",
    result: "Approved.",
  });
}

describe("Shopify inventory and variant tools", () => {
  test("adjusts inventory only with approval for the item and location", async () => {
    const repository = createInMemoryExecutionRepository();
    const inventoryItemId = "gid://shopify/InventoryItem/1";
    const locationId = "gid://shopify/Location/1";
    const approval = await approve(repository, "shopify.inventory.adjust", {
      type: "shopify_inventory_level",
      id: `${inventoryItemId}:${locationId}`,
    });
    let received: unknown;

    const result = await runShopifyInventoryAdjust(
      {
        repository,
        runId: "run-inventory-adjust",
        agentName: "shopify_ops_agent",
        approvalId: approval.id,
      },
      {
        inventoryItemId,
        locationId,
        delta: -2,
        reason: "correction",
        idempotencyKey: "inventory-adjust-1",
      },
      async (input) => {
        received = input;
        return { adjusted: true };
      },
    );

    expect(result).toEqual({ ok: true, data: { adjusted: true } });
    expect(received).toMatchObject({ inventoryItemId, locationId, delta: -2 });
  });

  test("blocks variant creation without an approved product target", async () => {
    const repository = createInMemoryExecutionRepository();
    let calls = 0;

    const result = await runShopifyVariantCreate(
      {
        repository,
        runId: "run-variant-create-blocked",
        agentName: "shopify_ops_agent",
      },
      {
        productId: "gid://shopify/Product/1",
        variants: [{ price: "99.00", optionValues: [{ name: "Black" }] }],
      },
      async () => {
        calls += 1;
        return { created: true };
      },
    );

    expect(result).toMatchObject({ ok: false, error: { code: "approval_required" } });
    expect(calls).toBe(0);
  });

  test("updates variants after approval for the exact product target", async () => {
    const repository = createInMemoryExecutionRepository();
    const productId = "gid://shopify/Product/1";
    const approval = await approve(repository, "shopify.variant.update", {
      type: "shopify_product",
      id: productId,
    });

    const result = await runShopifyVariantUpdate(
      {
        repository,
        runId: "run-variant-update",
        agentName: "shopify_ops_agent",
        approvalId: approval.id,
      },
      {
        productId,
        variants: [{ id: "gid://shopify/ProductVariant/1", price: "109.00" }],
      },
      async (input) => ({ updated: input }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        updated: {
          productId,
          variants: [{ id: "gid://shopify/ProductVariant/1", price: "109.00" }],
        },
      },
    });
  });

  test("rejects inventory adjustments with a zero delta", async () => {
    const repository = createInMemoryExecutionRepository();
    const inventoryItemId = "gid://shopify/InventoryItem/1";
    const locationId = "gid://shopify/Location/1";
    const approval = await approve(repository, "shopify.inventory.adjust", {
      type: "shopify_inventory_level",
      id: `${inventoryItemId}:${locationId}`,
    });

    const result = await runShopifyInventoryAdjust(
      {
        repository,
        runId: "run-inventory-invalid",
        agentName: "shopify_ops_agent",
        approvalId: approval.id,
      },
      { inventoryItemId, locationId, delta: 0, reason: "correction", idempotencyKey: "key" },
      async () => ({ adjusted: true }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });
});
