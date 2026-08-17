import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import {
  runShopifyCollectionsRead,
  runShopifyProductByHandleRead,
} from "../tools/shopify-read-tools";

describe("Shopify read tools", () => {
  test("reads a product by handle and records the governed read", async () => {
    const repository = createInMemoryExecutionRepository();

    const result = await runShopifyProductByHandleRead(
      {
        repository,
        runId: "run-product-handle",
        agentName: "shopify_ops_agent",
      },
      { handle: "satin-track-pant" },
      async (handle) => ({ product: { handle }, found: true }),
    );

    expect(result).toEqual({
      ok: true,
      data: { product: { handle: "satin-track-pant" }, found: true },
    });
    await expect(repository.listToolCalls()).resolves.toMatchObject([
      {
        runId: "run-product-handle",
        toolName: "shopify.product.read",
        capability: "read",
        riskLevel: 1,
        outcome: "succeeded",
      },
    ]);
  });

  test("rejects an empty product handle without invoking the reader", async () => {
    const repository = createInMemoryExecutionRepository();
    let calls = 0;

    const result = await runShopifyProductByHandleRead(
      {
        repository,
        runId: "run-invalid-handle",
        agentName: "shopify_ops_agent",
      },
      { handle: "   " },
      async () => {
        calls += 1;
        return {};
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(calls).toBe(0);
  });

  test("reads collections through the governed read contract", async () => {
    const repository = createInMemoryExecutionRepository();

    const result = await runShopifyCollectionsRead(
      {
        repository,
        runId: "run-collections",
        agentName: "shopify_ops_agent",
      },
      { first: 10 },
      async (first) => ({ collections: [], first }),
    );

    expect(result).toEqual({
      ok: true,
      data: { collections: [], first: 10 },
    });
    await expect(repository.listAuditEvents()).resolves.toMatchObject([
      {
        runId: "run-collections",
        toolName: "shopify.collections.read",
        eventType: "tool.execution",
        outcome: "succeeded",
      },
    ]);
  });
});
