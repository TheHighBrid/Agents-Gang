import { describe, expect, test, vi } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { createGmailDraftApproval, runGmailDraftCreation } from "../tools/gmail-draft-tool";

describe("governed Gmail draft creation", () => {
  const input = {
    messageId: "m1",
    threadId: "t1",
    to: "sender@example.com",
    subject: "Re: Action needed",
    body: "Thanks — I will review this today.",
  };

  test("blocks draft creation without explicit approval", async () => {
    const repository = createInMemoryExecutionRepository();
    const writer = vi.fn();
    const result = await runGmailDraftCreation(
      { repository, runId: "draft-run-1", agentName: "inbox_triage_agent" },
      input,
      writer,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "approval_required" } });
    expect(writer).not.toHaveBeenCalled();
  });

  test("creates one exact draft after matching approval and consumes it", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: (() => { let n = 0; return () => `id-${++n}`; })() });
    const approval = await createGmailDraftApproval(repository, input, "inbox_triage_agent");
    await repository.decideApproval({ approvalId: approval.id, status: "approved", result: "Approved exact draft" });
    const writer = vi.fn().mockResolvedValue({ id: "d1", messageId: "m1", threadId: "t1" });
    const result = await runGmailDraftCreation(
      { repository, runId: "draft-run-2", agentName: "inbox_triage_agent", approvalId: approval.id },
      input,
      writer,
    );
    expect(result).toEqual({ ok: true, data: { id: "d1", messageId: "m1", threadId: "t1" } });
    expect(writer).toHaveBeenCalledWith(input);
    await expect(repository.getApproval(approval.id)).resolves.toMatchObject({ status: "consumed" });
    await expect(runGmailDraftCreation(
      { repository, runId: "draft-run-3", agentName: "inbox_triage_agent", approvalId: approval.id },
      input,
      writer,
    )).resolves.toMatchObject({ ok: false, error: { code: "approval_not_approved" } });
  });

  test("rejects a changed body even when the original approval is approved", async () => {
    const repository = createInMemoryExecutionRepository();
    const approval = await createGmailDraftApproval(repository, input, "inbox_triage_agent");
    await repository.decideApproval({ approvalId: approval.id, status: "approved", result: "Approved exact draft" });
    const writer = vi.fn();
    const result = await runGmailDraftCreation(
      { repository, runId: "draft-run-4", agentName: "inbox_triage_agent", approvalId: approval.id },
      { ...input, body: "Changed after approval" },
      writer,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "approval_required" } });
    expect(writer).not.toHaveBeenCalled();
  });
});
