/**
 * Server-only, native HTTP Context.dev reader for public, non-sensitive URLs.
 * Scraped content is untrusted evidence, never instructions or authorization.
 */
import { isIP } from "node:net";

const ENDPOINT = "https://api.context.dev/v1/web/scrape";
const FORMATS = ["html", "markdown", "screenshot", "images", "bytes", "parse", "json", "highlights", "product"] as const;
export type WebReadFormat = typeof FORMATS[number];
type FormatOutput = { requested: boolean; success: boolean | null; data: unknown; error_code: string | null; message: string | null; type?: string | null };
export type ContextWebReadResult = {
  sourceUrl: string;
  finalUrl: string;
  retrievedAt: string;
  requestId: string | null;
  isPartial: boolean;
  outputs: Partial<Record<WebReadFormat, FormatOutput>>;
};
export type ContextWebReadOptions = {
  url: string;
  formats: Partial<Record<WebReadFormat, boolean>>;
  jsonSchema?: Record<string, unknown>;
  jsonInstructions?: string;
  highlightsQuery?: string;
  highlightsMaxCharacters?: number;
  parseParams?: Record<string, unknown>;
  productDedupeImages?: boolean;
  apiKey?: string;
  zdr?: boolean;
  maxAgeMs?: number;
  timeoutMs?: number;
  budgetMs?: number;
  fetcher?: typeof fetch;
};

export class ContextWebReadError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
    this.name = "ContextWebReadError";
  }
}

export function publicWebUrl(raw: string): string {
  if (raw.length > 2048) throw new Error("URL exceeds 2048 characters");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("public HTTP(S) URL required");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("public HTTP(S) URL without credentials required");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[(.*)\]$/, "$1");
  if (!host || !host.includes(".") || host === "localhost" ||
      host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") ||
      host.endsWith(".test") || host.endsWith(".home") || host.endsWith(".lan")) {
    throw new Error("private host not permitted");
  }
  // IP literal addresses can bypass domain-based restrictions.
  if (isIP(host)) throw new Error("IP-literal URL not permitted");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("nonstandard port not permitted");
  return url.toString();
}

function safeFormatOutput(value: unknown, requested: boolean, format: string): FormatOutput {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const success = item.success === true ? true : item.success === false ? false : requested ? false : null;
  const data = success ? item.data ?? null : null;
  return {
    requested: item.requested === true || requested,
    success, data,
    error_code: typeof item.error_code === "string" ? item.error_code : null,
    message: typeof item.message === "string" ? item.message : null,
    ...(format === "parse" ? { type: typeof item.type === "string" ? item.type : null } : {}),
  };
}

export async function scrapePublicWebPage(options: ContextWebReadOptions): Promise<ContextWebReadResult> {
  const sourceUrl = publicWebUrl(options.url);
  const key = (options.apiKey ?? process.env.CONTEXT_DEV_API_KEY ?? process.env.CONTEXT_API_KEY ?? "").trim();
  if (process.env.CONTEXT_DEV_ENABLED === "false") throw new ContextWebReadError("Context.dev is disabled");
  if (!key) throw new ContextWebReadError("CONTEXT_DEV_API_KEY must be configured");
  const formats = Object.fromEntries(Object.entries(options.formats).filter(([, value]) => value === true));
  if (!Object.keys(formats).length || Object.keys(formats).some((name) => !FORMATS.includes(name as WebReadFormat))) {
    throw new Error("at least one supported output format is required");
  }
  if (formats.json) {
    if (options.jsonSchema?.type !== "object") throw new Error("JSON Schema must describe an object");
    if (JSON.stringify(options.jsonSchema).length > 50_000) throw new Error("JSON Schema too large");
    if ((options.jsonInstructions?.length ?? 0) > 2000) throw new Error("JSON instructions too long");
  }
  if (formats.parse && (!options.parseParams || typeof options.parseParams !== "object")) {
    throw new Error("parseParams required for parsed output");
  }
  if (formats.highlights) {
    if (!options.highlightsQuery?.trim() || options.highlightsQuery.length > 2000) {
      throw new Error("highlights query must be 1 to 2000 characters");
    }
    if (options.zdr) throw new Error("highlights cannot be combined with ZDR");
    if ((options.highlightsMaxCharacters ?? 2000) < 100 || (options.highlightsMaxCharacters ?? 2000) > 20000) {
      throw new Error("highlights character limit must be 100 to 20000");
    }
  }
  const age = options.maxAgeMs ?? 21_600_000;
  if (!Number.isInteger(age) || age < 0 || age > 31_536_000_000) throw new Error("invalid cache freshness");
  const timeoutMs = options.timeoutMs ?? 20_000;
  const budgetMs = options.budgetMs ?? 25_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000 ||
      !Number.isInteger(budgetMs) || budgetMs < 1 || budgetMs > 300_000) {
    throw new Error("invalid request time budget");
  }
  const body: Record<string, unknown> = {
    url: sourceUrl,
    formats, maxAgeMs: age,
    timeoutOpts: { milliseconds: timeoutMs },
    zdr: options.zdr ? "enabled" : "disabled",
  };
  if (formats.json) body.jsonParams = {
    schema: options.jsonSchema,
    ...(options.jsonInstructions ? { instructions: options.jsonInstructions } : {}),
  };
  if (formats.highlights) body.highlightsParams = {
    query: options.highlightsQuery, maxCharacters: options.highlightsMaxCharacters ?? 2000,
  };
  if (formats.parse) body.parseParams = options.parseParams;
  if (formats.product) body.productParams = { dedupeImages: options.productDedupeImages === true };
  const fetcher = options.fetcher ?? fetch;
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining <= 0) throw new ContextWebReadError("per-task request deadline exceeded");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
    try {
      const response = await fetcher(ENDPOINT, {
        method: "POST", redirect: "error",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: controller.signal,
      });
      if (attempt === 0 && [408, 409, 429, 500, 502, 503, 504].includes(response.status)) continue;
      if (!response.ok) throw new ContextWebReadError("Context.dev HTTP " + response.status);
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new ContextWebReadError("malformed Context.dev response");
      }
      const payload = result as Record<string, unknown>;
      // Do not follow or surface private final destinations as usable evidence.
      let finalUrl: string;
      try {
        finalUrl = publicWebUrl(typeof payload.url === "string" ? payload.url : sourceUrl);
      } catch {
        throw new ContextWebReadError("Context.dev returned a non-public final URL");
      }
      const outputs: Partial<Record<WebReadFormat, FormatOutput>> = {};
      for (const name of FORMATS) {
        outputs[name] = safeFormatOutput(payload[name === "parse" ? "parsed" : name], Boolean(formats[name]), name);
      }
      return {
        sourceUrl, finalUrl, retrievedAt: new Date().toISOString(),
        requestId: typeof payload.request_id === "string" ? payload.request_id : null,
        isPartial: payload.isPartial === true || Object.values(outputs).some((v) => v.requested && v.success === false),
        outputs,
      };
    } catch (error) {
      if (attempt === 0 && error instanceof Error &&
        ["AbortError", "TimeoutError"].includes(error.name)) continue;
      if (attempt === 0 && error instanceof TypeError) continue;
      if (error instanceof ContextWebReadError) throw error;
      throw new ContextWebReadError("Context.dev connection failed");
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ContextWebReadError("Context.dev retry budget exhausted");
}
