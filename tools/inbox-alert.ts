import type { TriagedMessage } from "../jobs/inboxTriage";
import { defineTool, executeTool, type ToolExecutionContext } from "../lib/execution/tool-execution";

export type InboxAlertMessage = Pick<
  TriagedMessage,
  "id" | "threadId" | "from" | "to" | "subject" | "receivedAt" | "priority" | "category"
>;

export type InboxAlertNotifier = (messages: InboxAlertMessage[]) => Promise<void>;

export type InboxAlertDelivery = {
  sent: number;
  skipped: number;
};

function parseInboxAlertMessages(input: unknown): InboxAlertMessage[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("At least one inbox alert message is required");
  }
  return input.map((message) => {
    if (
      !message ||
      typeof message !== "object" ||
      !("id" in message) ||
      typeof message.id !== "string" ||
      !("threadId" in message) ||
      typeof message.threadId !== "string" ||
      !("from" in message) ||
      (typeof message.from !== "string" && message.from !== null) ||
      !("to" in message) ||
      (typeof message.to !== "string" && message.to !== null) ||
      !("subject" in message) ||
      (typeof message.subject !== "string" && message.subject !== null) ||
      !("receivedAt" in message) ||
      (typeof message.receivedAt !== "string" && message.receivedAt !== null) ||
      !("priority" in message) ||
      message.priority !== "high" ||
      !("category" in message) ||
      message.category !== "action_required"
    ) {
      throw new Error("Inbox alerts require valid high-priority message metadata");
    }
    return pickAlertFields(message as InboxAlertMessage);
  });
}

export function createInboxAlertTool(notifier: InboxAlertNotifier) {
  return defineTool({
    name: "inbox.alert.send",
    capability: "execute" as const,
    riskLevel: 2 as const,
    parseInput: parseInboxAlertMessages,
    execute: async (messages: InboxAlertMessage[]) => {
      await notifier(messages);
      return { sent: messages.length };
    },
  });
}

export function runInboxAlert(
  context: ToolExecutionContext,
  messages: InboxAlertMessage[],
  notifier: InboxAlertNotifier = (alertMessages) => postInboxAlert(alertMessages),
) {
  return executeTool(context, createInboxAlertTool(notifier), messages);
}

function pickAlertFields(message: InboxAlertMessage): InboxAlertMessage {
  return {
    id: message.id,
    threadId: message.threadId,
    from: message.from,
    to: message.to,
    subject: message.subject,
    receivedAt: message.receivedAt,
    priority: message.priority,
    category: message.category,
  };
}

function toAlertMessage(message: TriagedMessage): InboxAlertMessage {
  return pickAlertFields(message);
}

export async function notifyHighPriorityMessages(
  messages: TriagedMessage[],
  notifier?: InboxAlertNotifier,
): Promise<InboxAlertDelivery> {
  const highPriority = messages.filter((message) => message.priority === "high");
  if (highPriority.length === 0) return { sent: 0, skipped: messages.length };
  if (!notifier) return { sent: 0, skipped: highPriority.length };

  await notifier(highPriority.map(toAlertMessage));
  return { sent: highPriority.length, skipped: messages.length - highPriority.length };
}

export async function postInboxAlert(
  messages: InboxAlertMessage[],
  options: { webhookUrl?: string; fetcher?: typeof fetch } = {},
): Promise<void> {
  const webhookUrl = options.webhookUrl ?? process.env.INBOX_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;
  const parsedUrl = new URL(webhookUrl);
  if (parsedUrl.protocol !== "https:") throw new Error("Inbox alert webhook must use HTTPS");

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(parsedUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "inbox.high_priority",
      messages,
    }),
  });
  if (!response.ok) throw new Error(`Inbox alert webhook returned ${response.status}`);
}
