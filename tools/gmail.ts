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

type GmailFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type GmailReadOptions = {
  accessToken?: string;
  fetcher?: GmailFetcher;
  maxResults?: number;
};

export class GmailRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "GmailRequestError";
    this.status = status;
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

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new GmailRequestError(`Gmail API returned ${response.status}`, response.status >= 500 ? 502 : response.status);
  }
  return response.json() as Promise<T>;
}

export async function searchGmailMessages(
  query: string,
  options: GmailReadOptions = {},
): Promise<GmailMessageSummary[]> {
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
    listResponse = await readJson<GmailListResponse>(await fetcher(listUrl, { headers }));
  } catch (error) {
    if (error instanceof GmailRequestError) throw error;
    throw new GmailRequestError(error instanceof Error ? error.message : "Gmail search request failed");
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
      const detail = await readJson<GmailMessageResponse>(await fetcher(messageUrl, { headers }));
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
      throw new GmailRequestError(error instanceof Error ? error.message : "Gmail message request failed");
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
