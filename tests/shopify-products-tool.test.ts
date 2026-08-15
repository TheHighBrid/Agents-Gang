import { describe, expect, test } from "vitest";

import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runShopifyProductRead } from "../tools/shopify-products-tool";

describe("Shopify product read tool", () => {
  test("runs a product read through the common contract and records a successful read", async () => {
    const repository = createInMemoryExecutionRepository({
      clock: () => new Date("2026-08-15T12:00:00.000Z"),
      idFactory: () => "tool-call-1",
    });

    const result = await runShopifyProductRead(
      {
        repository,
        runId: "run-1",
        agentName: "shopify_ops_agent",
      },
      { first: 2 },
      async (first) => ({ products: [{ id: "product-1" }], first }),
    );

    expect(result).toEqual({
      ok: true,
      data: { products: [{ id: "product-1" }], first: 2 },
    });
    expect(await repository.listToolCalls()).toMatchObject([
      {
        toolName: "shopify.products.read",
        capability: "read",
        riskLevel: 1,
        outcome: "succeeded",
      },
    ]);
    expect(await repository.listAuditEvents()).toMatchObject([
      {
        runId: "run-1",
        toolName: "shopify.products.read",
        eventType: "tool.execution",
        outcome: "succeeded",
        metadata: {},
      },
    ]);
  });
});
