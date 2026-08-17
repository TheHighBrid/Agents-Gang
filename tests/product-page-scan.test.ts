import { describe, expect, test } from "vitest";

import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runProductPageScan, runProductPageScanJob } from "../jobs/productPageScan";

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


test("wraps scheduled scans in the governed job lifecycle", async () => {
  const repository = createInMemoryExecutionRepository({ idFactory: () => "scheduled-run-2" });

  const result = await runProductPageScanJob(
    repository,
    async (first) => ({ products: [{ id: "product-1" }], first }),
  );

  expect(result.data).toEqual({ ok: true, data: { products: [{ id: "product-1" }], first: 50 } });
  await expect(repository.listAgentRuns()).resolves.toMatchObject([
    { id: "scheduled-run-2", agentName: "product_page_agent", status: "completed" },
  ]);
  await expect(repository.listRoutingDecisions()).resolves.toMatchObject([
    { runId: "scheduled-run-2", selectedAgent: "product_page_agent", neededTools: ["shopify.products.read"] },
  ]);
});
