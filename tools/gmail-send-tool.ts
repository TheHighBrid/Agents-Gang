import { createApprovalRequest } from "./approvals";
import { GmailRequestError, fetchGmail, gmailResponseError, readGmailJson, type GmailFetcher } from "./gmail";
import { defineTool, executeTool, type ToolExecutionContext } from "../lib/execution/tool-execution";
import type { ExecutionRepository } from "../lib/execution/repository";

export type GmailDraftSendInput = {
  draftId: string;
};

export type GmailDraftSendResult = {
  messageId: string;
  threadId: string;
};

export type GmailDraftSender = (input: GmailDraftSendInput) => Promise<GmailDraftSendResult>;
export type GmailDraftSendOptions = {
  accessToken?: string;
  sendEnabled?: boolean;
  fetcher?: GmailFetcher;
  timeoutMs?: number;
};

function parseDraftSendInput(input: unknown): GmailDraftSendInput {
  if (!input || typeof input !== "object") throw new Error("Gmail draft send input is required");
  const draftId = (input as Record<string, unknown>).draftId;
  if (typeof draftId !== "string" || !draftId.trim()) throw new Error("draftId must be a non-empty string");
  return { draftId: draftId.trim() };
}

export async function sendGmailDraft(
  input: GmailDraftSendInput,
  options: GmailDraftSendOptions = {},
): Promise<GmailDraftSendResult> {
  if (process.env.GMAIL_ENABLED?.trim() === "false") {
    throw new Error("Gmail integration is disabled");
  }
  const parsed = parseDraftSendInput(input);
  const sendEnabled = options.sendEnabled ?? process.env.GMAIL_SEND_ENABLED === "true";
  if (!sendEnabled) throw new Error("Gmail send is not enabled");
  const accessToken = options.accessToken ?? process.env.GMAIL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Gmail access token is not configured");
  const fetcher = options.fetcher ?? fetch;
  const response = await fetchGmail(fetcher, "https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: parsed.draftId }),
  }, options.timeoutMs);
  if (!response.ok) throw gmailResponseError(response);
  const result = await readGmailJson<{ id?: string; threadId?: string }>(response);
  if (!result.id || !result.threadId) throw new GmailRequestError("Gmail draft send API returned an incomplete message");
  return { messageId: result.id, threadId: result.threadId };
}

export function createGmailDraftSendTool(sender: GmailDraftSender) {
  return defineTool({
    name: "gmail.draft.send",
    capability: "execute" as const,
    riskLevel: 4 as const,
    parseInput: parseDraftSendInput,
    getTarget: ({ draftId }) => ({ type: "gmail_draft", id: draftId }),
    execute: sender,
  });
}

export function runGmailDraftSend(
  context: ToolExecutionContext,
  input: unknown,
  sender: GmailDraftSender = (draft) => sendGmailDraft(draft),
) {
  return executeTool(context, createGmailDraftSendTool(sender), input);
}

export async function createGmailDraftSendApproval(
  repository: ExecutionRepository,
  input: GmailDraftSendInput,
  requestingAgent: string,
) {
  const parsed = parseDraftSendInput(input);
  return createApprovalRequest(repository, {
    requestingAgent,
    actionType: "gmail.draft.send",
    target: { type: "gmail_draft", id: parsed.draftId },
    riskLevel: 4,
    payloadSummary: `Send existing Gmail draft ${parsed.draftId}.`,
  });
}
