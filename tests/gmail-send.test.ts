import { describe, expect, test, vi } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { GmailRequestError } from "../tools/gmail";
import {
  createGmailDraftSendApproval,
  runGmailDraftSend,
  sendGmailDraft,
} from "../tools/gmail-send-tool";

describe("governed Gmail draft sending", () => {
  const input = { draftId: "draft-1" };

  test("blocks sending without explicit risk-4 approval", async () => {
    const repository = createInMemoryExecutionRepository();
    const sender = vi.fn();

    const result = await runGmailDraftSend(
      { repository, runId: "send-run-1", agentName: "inbox_triage_agent" },
      input,
      sender,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "approval_required" } });
    expect(sender).not.toHaveBeenCalled();
  });

  test("sends exactly the approved draft once and consumes the approval", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: (() => { let n = 0; return () => `id-${++n}`; })() });
    const approval = await createGmailDraftSendApproval(repository, input, "inbox_triage_agent");
    await repository.decideApproval({ approvalId: approval.id, status: "approved", result: "Approved exact Gmail draft send" });
    const sender = vi.fn().mockResolvedValue({ messageId: "message-1", threadId: "thread-1" });

    await expect(runGmailDraftSend(
      { repository, runId: "send-run-2", agentName: "inbox_triage_agent", approvalId: approval.id },
      input,
      sender,
    )).resolves.toEqual({ ok: true, data: { messageId: "message-1", threadId: "thread-1" } });
    expect(sender).toHaveBeenCalledWith(input);
    await expect(repository.getApproval(approval.id)).resolves.toMatchObject({ status: "consumed" });

    await expect(runGmailDraftSend(
      { repository, runId: "send-run-3", agentName: "inbox_triage_agent", approvalId: approval.id },
      input,
      sender,
    )).resolves.toMatchObject({ ok: false, error: { code: "approval_not_approved" } });
  });

  test("rejects a different draft even when the original approval is approved", async () => {
    const repository = createInMemoryExecutionRepository();
    const approval = await createGmailDraftSendApproval(repository, input, "inbox_triage_agent");
    await repository.decideApproval({ approvalId: approval.id, status: "approved", result: "Approved exact Gmail draft send" });
    const sender = vi.fn();

    const result = await runGmailDraftSend(
      { repository, runId: "send-run-4", agentName: "inbox_triage_agent", approvalId: approval.id },
      { draftId: "draft-2" },
      sender,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "approval_required" } });
    expect(sender).not.toHaveBeenCalled();
  });

  test("preserves a normalized Gmail rate limit in governed audit records", async () => {
    const repository = createInMemoryExecutionRepository();
    const approval = await createGmailDraftSendApproval(repository, input, "inbox_triage_agent");
    await repository.decideApproval({ approvalId: approval.id, status: "approved", result: "Approved exact Gmail draft send" });
    const sender = vi.fn().mockRejectedValue(new GmailRequestError("Gmail request was rate limited", 429, "gmail_rate_limited", true, 4));

    await expect(runGmailDraftSend(
      { repository, runId: "send-run-rate-limited", agentName: "inbox_triage_agent", approvalId: approval.id },
      input,
      sender,
    )).resolves.toMatchObject({ ok: false, error: { code: "tool_execution_failed", retriable: true } });
    await expect(repository.listToolCalls()).resolves.toMatchObject([
      { toolName: "gmail.draft.send", outcome: "failed", errorCode: "gmail_rate_limited" },
    ]);
    await expect(repository.listAuditEvents()).resolves.toMatchObject([
      { toolName: "gmail.draft.send", outcome: "failed", metadata: { errorCode: "gmail_rate_limited" } },
    ]);
  });

  test("applies a bounded timeout and normalizes aborted sends", async () => {
    const fetcher = vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));

    await expect(sendGmailDraft(input, { accessToken: "server-token", sendEnabled: true, timeoutMs: 2500, fetcher })).rejects.toMatchObject({
      code: "gmail_timeout",
      retriable: true,
    });
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  test("normalizes rate limits without exposing the OAuth token", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("slow down", { status: 429, headers: { "Retry-After": "4" } }));

    await expect(sendGmailDraft(input, { accessToken: "server-token", sendEnabled: true, fetcher })).rejects.toMatchObject({
      code: "gmail_rate_limited",
      status: 429,
      retriable: true,
      retryAfterSeconds: 4,
    });
    await expect(sendGmailDraft(input, { accessToken: "server-token", sendEnabled: true, fetcher })).rejects.not.toThrow("server-token");
  });

  test("does not send unless server-side send enablement is explicit", async () => {
    const fetcher = vi.fn();

    await expect(sendGmailDraft(input, { accessToken: "server-token", fetcher })).rejects.toThrow("Gmail send is not enabled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("calls only Gmail's explicit drafts send endpoint with server-side credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "message-1", threadId: "thread-1" }), { status: 200 }));

    await expect(sendGmailDraft(input, { accessToken: "server-token", sendEnabled: true, fetcher })).resolves.toEqual({ messageId: "message-1", threadId: "thread-1" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts/send",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer server-token" }) }),
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ id: "draft-1" });
  });
});
