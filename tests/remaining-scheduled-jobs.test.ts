import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runInboxTriage } from "../jobs/inboxTriage";
import { runWeeklyTrendRadar } from "../jobs/weeklyTrendRadar";

describe("remaining scheduled jobs", () => {
  test("runs inbox triage through the governed Gmail read contract", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: () => "inbox-run-1" });
    const result = await runInboxTriage(repository, async (query) => ({
      query,
      threads: [{ id: "thread-1", subject: "Order question" }],
    }));

    expect(result.data?.threads).toHaveLength(1);
    await expect(repository.listAgentRuns()).resolves.toMatchObject([
      { id: "inbox-run-1", agentName: "concierge_agent", status: "completed" },
    ]);
    await expect(repository.listToolCalls()).resolves.toMatchObject([
      { runId: "inbox-run-1", toolName: "gmail.search", outcome: "succeeded" },
    ]);
  });

  test("runs weekly trend radar through the governed web-search read contract", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: () => "trend-run-1" });
    const result = await runWeeklyTrendRadar(repository, async (query) => ({
      query,
      results: [{ title: "Trend report", url: "https://example.com/report" }],
    }));

    expect(result.data?.results).toHaveLength(1);
    await expect(repository.listAgentRuns()).resolves.toMatchObject([
      { id: "trend-run-1", agentName: "trend_radar_agent", status: "completed" },
    ]);
    await expect(repository.listToolCalls()).resolves.toMatchObject([
      { runId: "trend-run-1", toolName: "web.search", outcome: "succeeded" },
    ]);
  });
});
