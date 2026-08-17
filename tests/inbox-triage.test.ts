import { describe, expect, test, vi } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runInboxTriageJob } from "../jobs/inboxTriage";

describe("inbox triage scheduled job", () => {
  test("reads inbox messages through the governed Gmail adapter", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: () => "inbox-run-1" });
    const notifier = vi.fn().mockResolvedValue(undefined);
    const result = await runInboxTriageJob(
      repository,
      async (query, maxResults) => [{
        id: "m1",
        threadId: "t1",
        from: "sender@example.com",
        to: "owner@example.com",
        subject: "Action needed: review",
        snippet: "Please review this today.",
        receivedAt: "2025-10-14T10:00:00.000Z",
        labelIds: ["INBOX", "IMPORTANT"],
        query,
        maxResults,
      }],
      notifier,
    );

    expect(result.data.messages).toMatchObject([{ id: "m1", priority: "high", category: "action_required" }]);
    expect(result.data.draftApprovals).toHaveLength(1);
    const secondRun = await runInboxTriageJob(
      repository,
      async () => [{
        id: "m1",
        threadId: "t1",
        from: "sender@example.com",
        to: "owner@example.com",
        subject: "Action needed: review",
        snippet: "Please review this today.",
        receivedAt: "2025-10-14T10:00:00.000Z",
        labelIds: ["INBOX", "IMPORTANT"],
      }],
    );
    expect(secondRun.data.draftApprovals).toHaveLength(0);
    const toolCalls = await repository.listToolCalls();
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]).toMatchObject({ runId: "inbox-run-1", toolName: "gmail.messages.search", outcome: "succeeded" });
    await expect(repository.listAgentRuns()).resolves.toMatchObject([
      { id: "inbox-run-1", agentName: "inbox_triage_agent", status: "completed" },
    ]);
  });

  test("preserves read-adapter failures as failed scheduled runs", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: () => "inbox-run-2" });
    await expect(runInboxTriageJob(repository, async () => { throw new Error("Gmail unavailable"); })).rejects.toThrow("Gmail unavailable");
    await expect(repository.listAgentRuns()).resolves.toMatchObject([
      { id: "inbox-run-2", status: "failed", errorCode: "scheduled_job_failed" },
    ]);
  });
});
