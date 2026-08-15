import { describe, expect, test } from "vitest";

import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runProductPageScan } from "../jobs/productPageScan";

describe("product-page scan job", () => {
  test("uses the governed Shopify read contract for scheduled scans", async () => {
    const repository = createInMemoryExecutionRepository();

    const result = await runProductPageScan(
      {
        repository,
        runId: "scheduled-run-1",
        agentName: "product_page_agent",
      },
      async (first) => ({ products: [], first }),
    );

    expect(result).toEqual({
      ok: true,
      data: { products: [], first: 50 },
    });
    expect(await repository.listToolCalls()).toMatchObject([
      {
        runId: "scheduled-run-1",
        toolName: "shopify.products.read",
        outcome: "succeeded",
      },
    ]);
  });
});
