import type { ExecutionRepository } from "../lib/execution/repository";
import { runGmailSearch, type GmailSearchReader } from "../tools/gmail";
import { runScheduledJob } from "./scheduledJobRunner";

export function runInboxTriage<Result>(
  repository: ExecutionRepository,
  reader: GmailSearchReader<Result>,
) {
  return runScheduledJob(repository, {
    idempotencyKey: "scheduled-inbox-triage",
    agentName: "concierge_agent",
    provider: "system",
    model: "governed-tool-runner",
    routeAgent: "concierge_agent",
    riskLevel: 1,
    inputSummary: "Scheduled inbox triage.",
    reason: "The scheduled inbox workflow requested a read-only Gmail triage pass.",
    neededTools: ["gmail.search"],
    execute: async ({ runId, correlationId }) => {
      const result = await runGmailSearch(
        { repository, runId, agentName: "concierge_agent", correlationId },
        "is:unread newer_than:7d",
        reader,
      );
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    summarize: () => "Inbox triage completed.",
  });
}
