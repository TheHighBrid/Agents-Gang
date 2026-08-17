import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { runGovernedJob } from "./governedJob";
import { runGmailSearch, type GmailSearchReader } from "../tools/gmail-tool";
import type { GmailMessageSummary } from "../tools/gmail";

type TriagePriority = "high" | "normal" | "low";
type TriageCategory = "action_required" | "notification" | "general";

export type TriagedMessage = GmailMessageSummary & {
  priority: TriagePriority;
  category: TriageCategory;
};

function triageMessage(message: GmailMessageSummary): TriagedMessage {
  const searchableText = `${message.subject ?? ""} ${message.snippet}`.toLowerCase();
  const actionRequired = message.labelIds.includes("IMPORTANT") || /action required|action needed|urgent|deadline|review/.test(searchableText);
  const notification = /no[- ]?reply|receipt|invoice|newsletter|notification|unsubscribe/.test(searchableText);
  return {
    ...message,
    priority: actionRequired ? "high" : notification ? "low" : "normal",
    category: actionRequired ? "action_required" : notification ? "notification" : "general",
  };
}

export async function runInboxTriage(
  context: ToolExecutionContext,
  reader?: GmailSearchReader,
) {
  const result = await runGmailSearch(
    context,
    { query: "in:inbox -label:spam -label:trash", maxResults: 25 },
    reader,
  );
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return { messages: result.data.map(triageMessage) };
}

export function runInboxTriageJob(
  repository: ToolExecutionContext["repository"],
  reader?: GmailSearchReader,
) {
  return runGovernedJob({
    repository,
    agentName: "inbox_triage_agent",
    inputSummary: "Scheduled inbox triage",
    reason: "Review inbox metadata and identify messages requiring attention",
    neededTools: ["gmail.messages.search"],
    execute: (context) => runInboxTriage(context, reader),
  });
}
