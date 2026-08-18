import { createHash } from "node:crypto";
import { createApprovalRequest } from "./approvals";
import { defineTool, executeTool, type ToolExecutionContext } from "../lib/execution/tool-execution";
import type { ExecutionRepository } from "../lib/execution/repository";
import { GmailRequestError, fetchGmail, gmailResponseError, readGmailJson, type GmailFetcher } from "./gmail";

export type GmailDraftInput = {
  messageId: string;
  threadId: string;
  to: string;
  subject: string;
  body: string;
};

export type GmailDraftResult = {
  id: string;
  messageId: string;
  threadId: string;
};

export type GmailDraftWriter = (input: GmailDraftInput) => Promise<GmailDraftResult>;
export type GmailDraftOptions = {
  accessToken?: string;
  fetcher?: GmailFetcher;
  timeoutMs?: number;
};

function parseDraftInput(input: unknown): GmailDraftInput {
  if (!input || typeof input !== "object") throw new Error("draft input is required");
  const record = input as Record<string, unknown>;
  for (const field of ["messageId", "threadId", "to", "subject", "body"] as const) {
    if (typeof record[field] !== "string" || !record[field].trim()) {
      throw new Error(`${field} must be a non-empty string`);
    }
  }
  if (record.body && (record.body as string).length > 10000) throw new Error("body must be 10000 characters or fewer");
  return {
    messageId: (record.messageId as string).trim(),
    threadId: (record.threadId as string).trim(),
    to: (record.to as string).trim(),
    subject: (record.subject as string).trim(),
    body: record.body as string,
  };
}

export function gmailDraftPayloadDigest(input: GmailDraftInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function createGmailDraft(
  input: GmailDraftInput,
  options: GmailDraftOptions = {},
): Promise<GmailDraftResult> {
  if (process.env.GMAIL_ENABLED?.trim() === "false") {
    throw new Error("Gmail integration is disabled");
  }
  const parsed = parseDraftInput(input);
  const accessToken = options.accessToken ?? process.env.GMAIL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Gmail access token is not configured");
  const fetcher = options.fetcher ?? fetch;
  const rawMessage = [
    `To: ${parsed.to}`,
    `Subject: ${parsed.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    parsed.body,
  ].join("\r\n");
  const raw = Buffer.from(rawMessage, "utf8").toString("base64url");
  const response = await fetchGmail(fetcher, "https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: { threadId: parsed.threadId, raw } }),
  }, options.timeoutMs);
  if (!response.ok) throw gmailResponseError(response);
  const result = await readGmailJson<{ id?: string; message?: { id?: string; threadId?: string } }>(response);
  if (!result.id || !result.message?.id) throw new GmailRequestError("Gmail draft API returned an incomplete draft");
  return {
    id: result.id,
    messageId: result.message.id,
    threadId: result.message.threadId ?? parsed.threadId,
  };
}

export function createGmailDraftTool(writer: GmailDraftWriter) {
  return defineTool({
    name: "gmail.draft.create",
    capability: "draft" as const,
    riskLevel: 3 as const,
    parseInput: parseDraftInput,
    getTarget: (input) => ({ type: "gmail_draft", id: gmailDraftPayloadDigest(input) }),
    execute: writer,
  });
}

export function runGmailDraftCreation(
  context: ToolExecutionContext,
  input: unknown,
  writer: GmailDraftWriter = (draft) => createGmailDraft(draft),
) {
  return executeTool(context, createGmailDraftTool(writer), input);
}

export async function createGmailDraftApproval(
  repository: ExecutionRepository,
  input: GmailDraftInput,
  requestingAgent: string,
) {
  const parsed = parseDraftInput(input);
  return createApprovalRequest(repository, {
    requestingAgent,
    actionType: "gmail.draft.create",
    target: { type: "gmail_draft", id: gmailDraftPayloadDigest(parsed) },
    riskLevel: 3,
    payloadSummary: `Create Gmail draft to ${parsed.to}; subject: ${parsed.subject}; body length: ${parsed.body.length}.`,
  });
}
