import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { defineTool, executeTool } from "../lib/execution/tool-execution";

export type GmailSearchReader<Result = unknown> = (query: string) => Promise<Result>;
type GmailSearchInput = { query: string };

function parseGmailSearchInput(input: unknown): GmailSearchInput {
  if (!input || typeof input !== "object" || !("query" in input)) {
    throw new Error("query is required");
  }
  const query = (input as { query: unknown }).query;
  if (typeof query !== "string" || query.trim().length < 1 || query.length > 500) {
    throw new Error("query must be a non-empty string of at most 500 characters");
  }
  return { query: query.trim() };
}

export function createGmailSearchTool<Result>(reader: GmailSearchReader<Result>) {
  return defineTool({
    name: "gmail.search",
    capability: "read" as const,
    riskLevel: 1 as const,
    parseInput: parseGmailSearchInput,
    execute: ({ query }: GmailSearchInput) => reader(query),
  });
}

export function runGmailSearch<Result>(
  context: ToolExecutionContext,
  query: string,
  reader: GmailSearchReader<Result>,
) {
  return executeTool(context, createGmailSearchTool(reader), { query });
}

export async function searchEmails() {
  throw new Error("Gmail search requires an injected authenticated reader");
}
export async function createDraft() {
  throw new Error("Gmail draft creation is not implemented yet");
}
export async function labelEmail() {
  throw new Error("Gmail labeling is not implemented yet");
}
export async function summarizeThread() {
  throw new Error("Gmail thread summarization is not implemented yet");
}
