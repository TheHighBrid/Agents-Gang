import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runGovernedJob } from "../jobs/governedJob";

describe("governed scheduled jobs", () => {
  test("creates a run and routing record, then completes successfully", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: (() => {
      let index = 0;
      return () => `record-${++index}`;
    })(), clock: () => new Date("2026-08-17T12:00:00.000Z") });

    const result = await runGovernedJob({
      repository,
      agentName: "product_page_agent",
      inputSummary: "Scheduled product-page scan",
      reason: "Scheduled product-page audit",
      neededTools: ["shopify.products.read"],
      execute: async (context) => ({ runId: context.runId, products: [] }),
    });

    expect(result.data).toEqual({ runId: "record-1", products: [] });
    await expect(repository.listAgentRuns()).resolves.toMatchObject([
      { id: "record-1", agentName: "product_page_agent", status: "completed", provider: "scheduled", model: "governed-job" },
    ]);
    await expect(repository.listRoutingDecisions()).resolves.toMatchObject([
      { runId: "record-1", selectedAgent: "product_page_agent", approvalRequired: false },
    ]);
  });

  test("marks the run failed and rethrows job errors", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: () => "run-failed" });
    await expect(runGovernedJob({
      repository,
      agentName: "inbox_triage_agent",
      inputSummary: "Scheduled inbox triage",
      reason: "Scheduled triage",
      neededTools: [],
      execute: async () => { throw new Error("provider unavailable"); },
    })).rejects.toThrow("provider unavailable");
    await expect(repository.listAgentRuns()).resolves.toMatchObject([
      { id: "run-failed", status: "failed", errorCode: "scheduled_job_failed" },
    ]);
  });
});
