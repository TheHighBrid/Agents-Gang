import { describe, expect, test, vi } from "vitest";
import { notifyHighPriorityMessages } from "../tools/inbox-alert";
import type { TriagedMessage } from "../jobs/inboxTriage";

describe("inbox high-priority alerts", () => {
  const message: TriagedMessage = {
    id: "m1",
    threadId: "t1",
    from: "sender@example.com",
    to: "owner@example.com",
    subject: "Action needed",
    snippet: "Private message body must not be sent in an alert.",
    receivedAt: "2025-10-14T10:00:00.000Z",
    labelIds: ["INBOX", "IMPORTANT"],
    priority: "high",
    category: "action_required",
  };

  test("notifies only high-priority metadata and redacts message bodies", async () => {
    const notifier = vi.fn().mockResolvedValue(undefined);
    await expect(notifyHighPriorityMessages([message], notifier)).resolves.toEqual({ sent: 1, skipped: 0 });
    expect(notifier).toHaveBeenCalledWith([expect.objectContaining({ id: "m1", subject: "Action needed" })]);
    expect(notifier.mock.calls[0][0][0]).not.toHaveProperty("snippet");
  });

  test("does not call a notifier when there are no high-priority messages", async () => {
    const notifier = vi.fn();
    await expect(notifyHighPriorityMessages([{ ...message, priority: "normal" }], notifier)).resolves.toEqual({ sent: 0, skipped: 1 });
    expect(notifier).not.toHaveBeenCalled();
  });
});
