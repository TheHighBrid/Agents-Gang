import type { ExecutionRepository } from "../lib/execution/repository";
import { runWebSearch, type WebSearchReader } from "../tools/webSearch";
import { runScheduledJob } from "./scheduledJobRunner";

export function runWeeklyTrendRadar<Result>(
  repository: ExecutionRepository,
  reader: WebSearchReader<Result>,
) {
  return runScheduledJob(repository, {
    idempotencyKey: "scheduled-weekly-trend-radar",
    agentName: "trend_radar_agent",
    provider: "system",
    model: "governed-tool-runner",
    routeAgent: "trend_radar_agent",
    riskLevel: 1,
    inputSummary: "Weekly trend radar.",
    reason: "The weekly schedule requested a read-only trend research pass.",
    neededTools: ["web.search"],
    execute: async ({ runId }) => {
      const result = await runWebSearch(
        { repository, runId, agentName: "trend_radar_agent" },
        "Melato ecommerce product and customer trends this week",
        reader,
      );
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    summarize: () => "Weekly trend radar completed.",
  });
}
