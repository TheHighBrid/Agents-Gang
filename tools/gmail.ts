export type GmailMessageSummary = {
  id: string;
  threadId: string;
  from: string | null;
  to: string | null;
  subject: string | null;
  snippet: string;
  receivedAt: string | null;
  labelIds: string[];
};

export type GmailFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type GmailReadOptions = {
  accessToken?: string;
  fetcher?: GmailFetcher;
  maxResults?: number;
  timeoutMs?: number;
};

export type GmailRequestErrorCode =
  | "gmail_auth_failed"
  | "gmail_rate_limited"
  | "gmail_upstream_failed"
  | "gmail_transport_failed"
  | "gmail_timeout"
  | "gmail_malformed_response";

export class GmailRequestError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly code: GmailRequestErrorCode = "gmail_upstream_failed",
    public readonly retriable = true,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "GmailRequestError";
  }
}

type GmailListResponse = { messages?: Array<{ id?: string; threadId?: string }> };
type GmailMessageResponse = {
  id?: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: { headers?: Array<{ name?: string; value?: string }> };
};

function assertGmailEnabled() {
  if (process.env.GMAIL_ENABLED?.trim() === "false") {
    throw new Error("Gmail integration is disabled");
  }
}

function getHeader(message: GmailMessageResponse, name: string): string | null {
  const header = message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

function normalizeDate(message: GmailMessageResponse): string | null {
  const headerDate = getHeader(message, "date");
  if (headerDate) {
    const parsed = new Date(headerDate);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (message.internalDate) {
    const parsed = new Date(Number(message.internalDate));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

export function gmailResponseError(response: Response): GmailRequestError {
  if (response.status === 401 || response.status === 403) {
    return new GmailRequestError("Gmail authentication failed", response.status, "gmail_auth_failed", false);
  }
  if (response.status === 429) {
    return new GmailRequestError("Gmail request was rate limited", response.status, "gmail_rate_limited", true, retryAfterSeconds(response));
  }
  return new GmailRequestError("Gmail upstream request failed", response.status, "gmail_upstream_failed", response.status >= 500);
}

function resolveGmailTimeout(timeoutMs?: number): number {
  const configured = timeoutMs ?? Number(process.env.GMAIL_REQUEST_TIMEOUT_MS ?? "10000");
  if (!Number.isInteger(configured) || configured < 1_000 || configured > 30_000) {
    throw new Error("Gmail request timeout must be an integer between 1000 and 30000 milliseconds");
  }
  return configured;
}

export async function fetchGmail(
  fetcher: GmailFetcher,
  url: RequestInfo | URL,
  init: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveGmailTimeout(timeoutMs));
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GmailRequestError("Gmail request timed out", 502, "gmail_timeout", true);
    }
    throw new GmailRequestError("Gmail transport request failed", 502, "gmail_transport_failed", true);
  } finally {
    clearTimeout(timeout);
  }
}

export async function readGmailJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw gmailResponseError(response);
  try {
    return await response.json() as T;
  } catch {
    throw new GmailRequestError("Gmail returned a malformed response", response.status, "gmail_malformed_response", true);
  }
}

export async function searchGmailMessages(
  query: string,
  options: GmailReadOptions = {},
): Promise<GmailMessageSummary[]> {
  assertGmailEnabled();
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error("Gmail search query is required");
  const maxResults = options.maxResults ?? 10;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 25) {
    throw new Error("maxResults must be an integer from 1 to 25");
  }

  const accessToken = options.accessToken ?? process.env.GMAIL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Gmail access token is not configured");
  const fetcher = options.fetcher ?? fetch;
  const headers = { Authorization: `Bearer ${accessToken}` };
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", normalizedQuery);
  listUrl.searchParams.set("maxResults", String(maxResults));

  let listResponse: GmailListResponse;
  try {
    listResponse = await readGmailJson<GmailListResponse>(
      await fetchGmail(fetcher, listUrl, { headers }, options.timeoutMs),
    );
  } catch (error) {
    if (error instanceof GmailRequestError) throw error;
    throw new GmailRequestError("Gmail search transport request failed", 502, "gmail_transport_failed", true);
  }

  const messages = (listResponse.messages ?? []).filter((message): message is { id: string; threadId?: string } => typeof message.id === "string");
  const summaries: GmailMessageSummary[] = [];
  for (const message of messages.slice(0, maxResults)) {
    const messageUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}`);
    messageUrl.searchParams.set("format", "metadata");
    for (const header of ["From", "To", "Subject", "Date"]) {
      messageUrl.searchParams.append("metadataHeaders", header);
    }
    try {
      const detail = await readGmailJson<GmailMessageResponse>(
        await fetchGmail(fetcher, messageUrl, { headers }, options.timeoutMs),
      );
      if (typeof detail.id !== "string") continue;
      summaries.push({
        id: detail.id,
        threadId: detail.threadId ?? message.threadId ?? "",
        from: getHeader(detail, "from"),
        to: getHeader(detail, "to"),
        subject: getHeader(detail, "subject"),
        snippet: typeof detail.snippet === "string" ? detail.snippet : "",
        receivedAt: normalizeDate(detail),
        labelIds: Array.isArray(detail.labelIds) ? detail.labelIds.filter((label): label is string => typeof label === "string") : [],
      });
    } catch (error) {
      if (error instanceof GmailRequestError) throw error;
      throw new GmailRequestError("Gmail message transport request failed", 502, "gmail_transport_failed", true);
    }
  }
  return summaries;
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
