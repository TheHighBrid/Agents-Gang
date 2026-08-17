import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runDailyMelatoAudit } from "../jobs/dailyMelatoAudit";

describe("daily Melato audit job", () => {
  test("runs a governed Shopify scan and persists its lifecycle", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: () => "daily-run-1" });

    const result = await runDailyMelatoAudit(
      repository,
      async (first) => ({ products: [{ id: "product-1" }, { id: "product-2" }], first }),
    );

    expect(result.data).toEqual({
      products: [{ id: "product-1" }, { id: "product-2" }],
      first: 50,
    });
    await expect(repository.listAgentRuns()).resolves.toMatchObject([
      {
        id: "daily-run-1",
        agentName: "shopify_ops_agent",
        status: "completed",
        outputSummary: "Daily Melato audit completed.",
      },
    ]);
    await expect(repository.listRoutingDecisions()).resolves.toMatchObject([
      {
        runId: "daily-run-1",
        selectedAgent: "shopify_ops_agent",
        neededTools: ["shopify.products.read"],
      },
    ]);
    await expect(repository.listToolCalls()).resolves.toMatchObject([
      { runId: "daily-run-1", toolName: "shopify.products.read", outcome: "succeeded" },
    ]);
  });
});
