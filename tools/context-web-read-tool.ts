import { defineTool, executeTool, type ToolExecutionContext } from "../lib/execution/tool-execution";
import { scrapePublicWebPage, publicWebUrl, type ContextWebReadOptions, type ContextWebReadResult } from "./contextWebRead";

export type WebReadingBudget = {
  consume(runId: string): boolean;
  remaining(runId: string): number;
};

/** Bounded in-memory budget per execution run, with expiry and bounded storage. */
export function createWebReadingBudget({ maxPerRun = 2, ttlMs = 3_600_000 } = {}): WebReadingBudget {
  if (!Number.isInteger(maxPerRun) || maxPerRun < 1 || maxPerRun > 10) throw new Error("invalid web read cap");
  const count = new Map<string, { used: number; expires: number }>();
  const consume = (runId: string) => {
    const now = Date.now();
    // Proactively clear expired entries and bound the in-process map size.
    for (const [key, item] of count) if (item.expires < now) count.delete(key);
    if (!count.has(runId) && count.size >= 2000) count.delete(count.keys().next().value!);
    const item = count.get(runId) ?? { used: 0, expires: now + ttlMs };
    if (item.used >= maxPerRun) return false;
    count.set(runId, { ...item, used: item.used + 1 });
    return true;
  };
  return {
    consume,
    remaining: (runId) => Math.max(0, maxPerRun - (count.get(runId)?.used ?? 0)),
  };
}

const defaultBudget = createWebReadingBudget({ maxPerRun: 2 });
export type WebReadInput = {
  url: string;
  formats?: ContextWebReadOptions["formats"];
  jsonSchema?: Record<string, unknown>;
  jsonInstructions?: string;
  highlightsQuery?: string;
  highlightsMaxCharacters?: number;
  parseParams?: Record<string, unknown>;
  zdr?: boolean;
};

type WebPageReader = (options: ContextWebReadOptions) => Promise<ContextWebReadResult>;
type WebReaderDeps = { reader?: WebPageReader; budget?: WebReadingBudget };

function parseInput(raw: unknown): WebReadInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("web read input must be an object");
  const data = raw as Record<string, unknown>;
  if (typeof data.url !== "string") throw new Error("URL required");
  const url = publicWebUrl(data.url);
  const formats = data.formats === undefined ? { markdown: true } : data.formats;
  if (!formats || typeof formats !== "object" || Array.isArray(formats)) throw new Error("formats must be an object");
  if (!Object.entries(formats).some(([, value]) => value === true)) throw new Error("a format must be enabled");
  if (data.jsonSchema !== undefined && (!data.jsonSchema || typeof data.jsonSchema !== "object" || Array.isArray(data.jsonSchema))) {
    throw new Error("JSON schema must be an object");
  }
  if (data.highlightsQuery !== undefined && typeof data.highlightsQuery !== "string") throw new Error("highlights query must be text");
  if (data.jsonInstructions !== undefined && typeof data.jsonInstructions !== "string") throw new Error("JSON instructions must be text");
  if (data.parseParams !== undefined && (!data.parseParams || typeof data.parseParams !== "object" || Array.isArray(data.parseParams))) {
    throw new Error("parser parameters must be an object");
  }
  if (data.zdr !== undefined && typeof data.zdr !== "boolean") throw new Error("zdr must be boolean");
  return {
    url, formats: formats as ContextWebReadOptions["formats"],
    jsonSchema: data.jsonSchema as Record<string, unknown> | undefined,
    jsonInstructions: data.jsonInstructions as string | undefined,
    highlightsQuery: data.highlightsQuery as string | undefined,
    highlightsMaxCharacters: data.highlightsMaxCharacters as number | undefined,
    parseParams: data.parseParams as Record<string, unknown> | undefined,
    zdr: data.zdr as boolean | undefined,
  };
}

export function createContextWebReadTool(runId: string, deps: WebReaderDeps = {}) {
  const reader = deps.reader ?? scrapePublicWebPage;
  const budget = deps.budget ?? defaultBudget;
  return defineTool({
    name: "web.read",
    capability: "read" as const,
    riskLevel: 1 as const,
    parseInput,
    execute: async (input: WebReadInput) => {
      if (!budget.consume(runId)) throw new Error("Context.dev per-run request budget exhausted");
      return reader({
        url: input.url,
        formats: input.formats ?? { markdown: true },
        jsonSchema: input.jsonSchema, jsonInstructions: input.jsonInstructions,
        highlightsQuery: input.highlightsQuery, highlightsMaxCharacters: input.highlightsMaxCharacters,
        parseParams: input.parseParams, zdr: input.zdr,
      });
    },
  });
}

export function runContextWebRead(context: ToolExecutionContext, input: unknown, deps: WebReaderDeps = {}) {
  return executeTool(context, createContextWebReadTool(context.runId, deps), input);
}
