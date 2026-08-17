import type { TriagedMessage } from "../jobs/inboxTriage";

export type InboxAlertMessage = Pick<
  TriagedMessage,
  "id" | "threadId" | "from" | "to" | "subject" | "receivedAt" | "priority" | "category"
>;

export type InboxAlertNotifier = (messages: InboxAlertMessage[]) => Promise<void>;

export type InboxAlertDelivery = {
  sent: number;
  skipped: number;
};

function toAlertMessage(message: TriagedMessage): InboxAlertMessage {
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
