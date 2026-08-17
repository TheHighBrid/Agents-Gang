import { defineTool, executeTool, type ToolExecutionContext } from "../lib/execution/tool-execution";
import { searchGmailMessages, type GmailMessageSummary } from "./gmail";

export type GmailSearchReader = (query: string, maxResults: number) => Promise<GmailMessageSummary[]>;

type GmailSearchInput = {
  query: string;
  maxResults: number;
};

function parseGmailSearchInput(input: unknown): GmailSearchInput {
  if (!input || typeof input !== "object" || !("query" in input)) {
    throw new Error("query is required");
  }
  const query = (input as { query: unknown }).query;
  const maxResults = "maxResults" in input ? (input as { maxResults: unknown }).maxResults : 10;
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("query must be a non-empty string");
  }
  if (!Number.isInteger(maxResults) || typeof maxResults !== "number" || maxResults < 1 || maxResults > 25) {
    throw new Error("maxResults must be an integer from 1 to 25");
  }
  return { query: query.trim(), maxResults };
}

export function createGmailSearchTool(reader: GmailSearchReader) {
  return defineTool({
    name: "gmail.messages.search",
    capability: "read" as const,
    riskLevel: 1 as const,
    parseInput: parseGmailSearchInput,
    execute: ({ query, maxResults }: GmailSearchInput) => reader(query, maxResults),
  });
}

export function runGmailSearch(
  context: ToolExecutionContext,
  input: unknown,
  reader: GmailSearchReader = (query, maxResults) => searchGmailMessages(query, { maxResults }),
) {
  return executeTool(context, createGmailSearchTool(reader), input);
}
