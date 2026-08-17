import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { defineTool, executeTool } from "../lib/execution/tool-execution";

export type WebSearchReader<Result = unknown> = (query: string) => Promise<Result>;
type WebSearchInput = { query: string };

function parseWebSearchInput(input: unknown): WebSearchInput {
  if (!input || typeof input !== "object" || !("query" in input)) {
    throw new Error("query is required");
  }
  const query = (input as { query: unknown }).query;
  if (typeof query !== "string" || query.trim().length < 1 || query.length > 500) {
    throw new Error("query must be a non-empty string of at most 500 characters");
  }
  return { query: query.trim() };
}

export function createWebSearchTool<Result>(reader: WebSearchReader<Result>) {
  return defineTool({
    name: "web.search",
    capability: "read" as const,
    riskLevel: 1 as const,
    parseInput: parseWebSearchInput,
    execute: ({ query }: WebSearchInput) => reader(query),
  });
}

export function runWebSearch<Result>(
  context: ToolExecutionContext,
  query: string,
  reader: WebSearchReader<Result>,
) {
  return executeTool(context, createWebSearchTool(reader), { query });
}

export async function webSearch() {
  throw new Error("Web search requires an injected authenticated reader");
}
