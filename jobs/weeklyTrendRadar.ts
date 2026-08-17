import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { runWebSearch, type WebSearchReader } from "../tools/web-search-tool";
import type { WebSearchResult } from "../tools/webSearch";
import { runGovernedJob } from "./governedJob";

export const TREND_RADAR_QUERIES = [
  "luxury streetwear fashion trends",
  "fashion ecommerce and AI design tools",
  "Ottawa Montreal fashion events",
  "Morocco MENA fashion design",
  "FC Barcelona culture fashion",
] as const;

export type TrendRadarTopic = {
  query: string;
  results: WebSearchResult[];
};

/** Collect a bounded, provenance-preserving set of searches for the weekly briefing. */
export async function runWeeklyTrendRadar(
  context: ToolExecutionContext,
  reader?: WebSearchReader,
): Promise<{ topics: TrendRadarTopic[] }> {
  const topics: TrendRadarTopic[] = [];
  for (const query of TREND_RADAR_QUERIES) {
    const result = await runWebSearch(context, { query, limit: 5 }, reader);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    topics.push({ query, results: result.data });
  }
  return { topics };
}

export function runWeeklyTrendRadarJob(
  repository: ToolExecutionContext["repository"],
  reader?: WebSearchReader,
) {
  return runGovernedJob({
    repository,
    agentName: "trend_radar_agent",
    inputSummary: "Scheduled weekly trend radar",
    reason: "Collect sourced fashion, commerce, culture, and local-event signals",
    neededTools: ["web.search"],
    execute: (context) => runWeeklyTrendRadar(context, reader),
  });
}
