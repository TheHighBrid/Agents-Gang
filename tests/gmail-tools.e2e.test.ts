import { describe, expect, test, vi } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { searchGmailMessages } from "../tools/gmail";
import { createGmailDraftApproval, createGmailDraft, runGmailDraftCreation } from "../tools/gmail-draft-tool";
import { runGmailSearch } from "../tools/gmail-tool";
import { createGmailDraftSendApproval, runGmailDraftSend, sendGmailDraft } from "../tools/gmail-send-tool";

describe("Gmail tools provider-backed integration", () => {
  test("governs metadata read, exact draft creation, and exact draft send without persisting body content", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "message-1", threadId: "thread-1" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "message-1",
        threadId: "thread-1",
        snippet: "Please review the proposal.",
        labelIds: ["INBOX"],
        payload: { headers: [
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "owner@example.com" },
          { name: "Subject", value: "Proposal" },
        ] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-1", message: { id: "draft-message-1", threadId: "thread-1" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sent-message-1", threadId: "thread-1" }), { status: 200 }));
    const repository = createInMemoryExecutionRepository({ idFactory: (() => { let n = 0; return () => `id-${++n}`; })() });
    const read = (query: string, maxResults: number) => searchGmailMessages(query, { accessToken: "test-token", fetcher, maxResults });

    await expect(runGmailSearch(
      { repository, runId: "gmail-read-run", agentName: "inbox_triage_agent" },
      { query: "in:inbox", maxResults: 1 },
      read,
    )).resolves.toMatchObject({ ok: true, data: [{ id: "message-1", threadId: "thread-1", subject: "Proposal" }] });

    const draftInput = {
      messageId: "message-1",
      threadId: "thread-1",
      to: "sender@example.com",
      subject: "Re: Proposal",
      body: "Thanks. I will review this today.",
    };
    const draftApproval = await createGmailDraftApproval(repository, draftInput, "inbox_triage_agent");
    await repository.decideApproval({ approvalId: draftApproval.id, status: "approved", result: "Approved exact draft" });
    await expect(runGmailDraftCreation(
      { repository, runId: "gmail-draft-run", agentName: "inbox_triage_agent", approvalId: draftApproval.id },
      draftInput,
      (input) => createGmailDraft(input, { accessToken: "test-token", fetcher }),
    )).resolves.toEqual({ ok: true, data: { id: "draft-1", messageId: "draft-message-1", threadId: "thread-1" } });

    const sendInput = { draftId: "draft-1" };
    const sendApproval = await createGmailDraftSendApproval(repository, sendInput, "inbox_triage_agent");
    await repository.decideApproval({ approvalId: sendApproval.id, status: "approved", result: "Approved exact draft send" });
    await expect(runGmailDraftSend(
      { repository, runId: "gmail-send-run", agentName: "inbox_triage_agent", approvalId: sendApproval.id },
      sendInput,
      (input) => sendGmailDraft(input, { accessToken: "test-token", sendEnabled: true, fetcher }),
    )).resolves.toEqual({ ok: true, data: { messageId: "sent-message-1", threadId: "thread-1" } });

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("/messages?q=in%3Ainbox&maxResults=1"),
      expect.stringContaining("/messages/message-1?format=metadata"),
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts/send",
    ]);
    expect(JSON.parse(fetcher.mock.calls[3][1].body)).toEqual({ id: "draft-1" });
    expect(draftApproval.payloadSummary).not.toContain(draftInput.body);
    await expect(repository.listAuditEvents()).resolves.toMatchObject([
      { toolName: "gmail.messages.search", outcome: "succeeded" },
      { toolName: "gmail.draft.create", outcome: "succeeded" },
      { toolName: "gmail.draft.send", outcome: "succeeded" },
    ]);
  });
});
