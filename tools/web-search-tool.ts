import { defineTool, executeTool, type ToolExecutionContext } from "../lib/execution/tool-execution";
import { webSearch, type WebSearchResult } from "./webSearch";

export type WebSearchReader = (query: string, limit: number) => Promise<WebSearchResult[]>;

type WebSearchInput = {
  query: string;
  limit?: number;
};

function parseWebSearchInput(input: unknown): WebSearchInput {
  if (!input || typeof input !== "object" || !("query" in input)) {
    throw new Error("query is required");
  }

  const query = (input as { query: unknown }).query;
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("query must be a non-empty string");
  }
  if (query.trim().length > 200) {
    throw new Error("query must be 200 characters or fewer");
  }

  const rawLimit = (input as { limit?: unknown }).limit;
  if (rawLimit !== undefined && (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 10)) {
    throw new Error("limit must be an integer from 1 to 10");
  }

  return { query: query.trim(), limit: rawLimit as number | undefined };
}

export function createWebSearchTool(reader: WebSearchReader) {
  return defineTool({
    name: "web.search",
    capability: "read" as const,
    riskLevel: 1 as const,
    parseInput: parseWebSearchInput,
    execute: ({ query, limit = 5 }: WebSearchInput) => reader(query, limit),
  });
}

export function runWebSearch(
  context: ToolExecutionContext,
  input: unknown,
  reader: WebSearchReader = (query, limit) => webSearch(query, { limit }),
) {
  return executeTool(context, createWebSearchTool(reader), input);
}
