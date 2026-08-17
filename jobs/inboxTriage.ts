import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { runGovernedJob } from "./governedJob";
import { runGmailSearch, type GmailSearchReader } from "../tools/gmail-tool";
import type { GmailMessageSummary } from "../tools/gmail";
import { notifyHighPriorityMessages, postInboxAlert, type InboxAlertNotifier } from "../tools/inbox-alert";
import { createGmailDraftApproval, gmailDraftPayloadDigest, type GmailDraftInput } from "../tools/gmail-draft-tool";

type TriagePriority = "high" | "normal" | "low";
type TriageCategory = "action_required" | "notification" | "general";

export type TriagedMessage = GmailMessageSummary & {
  priority: TriagePriority;
  category: TriageCategory;
};

export type DraftApprovalSummary = {
  approvalId: string;
  messageId: string;
  targetDigest: string;
};

const DEFAULT_DRAFT_BODY = "Thanks for your message. I have received it and will review it shortly.";

export async function prepareHighPriorityDraftApprovals(
  repository: ToolExecutionContext["repository"],
  messages: TriagedMessage[],
  bodyFactory: (message: TriagedMessage) => string = () => DEFAULT_DRAFT_BODY,
): Promise<DraftApprovalSummary[]> {
  const existing = await repository.queryApprovals({ actionType: "gmail.draft.create", limit: 100 });
  const existingTargets = new Set(existing.approvals.map((approval) => approval.target.id));
  const summaries: DraftApprovalSummary[] = [];
  for (const message of messages.filter((item) => item.priority === "high" && item.from)) {
    const draft: GmailDraftInput = {
      messageId: message.id,
      threadId: message.threadId,
      to: message.from as string,
      subject: message.subject ? (message.subject.startsWith("Re:") ? message.subject : `Re: ${message.subject}`) : "Re: your message",
      body: bodyFactory(message),
    };
    const targetDigest = gmailDraftPayloadDigest(draft);
    if (existingTargets.has(targetDigest)) continue;
    const approval = await createGmailDraftApproval(repository, draft, "inbox_triage_agent");
    existingTargets.add(targetDigest);
    summaries.push({ approvalId: approval.id, messageId: message.id, targetDigest });
  }
  return summaries;
}

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
  notifier?: InboxAlertNotifier,
) {
  return runGovernedJob({
    repository,
    agentName: "inbox_triage_agent",
    inputSummary: "Scheduled inbox triage",
    reason: "Review inbox metadata and identify messages requiring attention",
    neededTools: ["gmail.messages.search"],
    execute: async (context) => {
      const report = await runInboxTriage(context, reader);
      const configuredNotifier = notifier ?? (process.env.INBOX_ALERT_WEBHOOK_URL ? (messages: Parameters<InboxAlertNotifier>[0]) => postInboxAlert(messages) : undefined);
      const alertDelivery = await notifyHighPriorityMessages(report.messages, configuredNotifier);
      const draftApprovals = await prepareHighPriorityDraftApprovals(repository, report.messages);
      await repository.recordAuditEvent({
        runId: context.runId,
        agentName: "inbox_triage_agent",
        eventType: "inbox.alerts.evaluated",
        outcome: "succeeded",
        metadata: {
          highPriorityCount: report.messages.filter((message) => message.priority === "high").length,
          sent: alertDelivery.sent,
          skipped: alertDelivery.skipped,
          deliveryConfigured: Boolean(configuredNotifier),
        },
      });
      return { ...report, alertDelivery, draftApprovals };
    },
  });
}
