import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runGmailSearch } from "../tools/gmail-tool";

describe("governed Gmail search tool", () => {
  test("executes a metadata-only search and records governance events", async () => {
    const repository = createInMemoryExecutionRepository();
    const result = await runGmailSearch(
      { repository, runId: "gmail-run-1", agentName: "inbox_triage_agent" },
      { query: "in:inbox", maxResults: 5 },
      async (query, maxResults) => [{ id: "m1", threadId: "t1", from: null, to: null, subject: query, snippet: "", receivedAt: null, labelIds: [], maxResults }],
    );

    expect(result).toEqual({ ok: true, data: [{ id: "m1", threadId: "t1", from: null, to: null, subject: "in:inbox", snippet: "", receivedAt: null, labelIds: [], maxResults: 5 }] });
    await expect(repository.listToolCalls()).resolves.toMatchObject([
      { runId: "gmail-run-1", toolName: "gmail.messages.search", capability: "read", riskLevel: 1, outcome: "succeeded" },
    ]);
    await expect(repository.listAuditEvents()).resolves.toMatchObject([
      { runId: "gmail-run-1", toolName: "gmail.messages.search", outcome: "succeeded" },
    ]);
  });
});
