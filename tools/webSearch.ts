export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type SearchFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type WebSearchOptions = {
  apiKey?: string;
  endpoint?: string;
  limit?: number;
  fetcher?: SearchFetcher;
};

export class WebSearchConfigurationError extends Error {
  readonly status = 503;
  constructor(message = "Web search is not configured") {
    super(message);
    this.name = "WebSearchConfigurationError";
  }
}

export class WebSearchRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "WebSearchRequestError";
    this.status = status;
  }
}

export async function webSearch(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("Search query is required");
  }
  if (normalizedQuery.length > 200) {
    throw new Error("Search query must be 200 characters or fewer");
  }
  if (process.env.WEB_SEARCH_ENABLED?.trim() === "false") {
    throw new WebSearchConfigurationError("Web search integration is disabled");
  }

  const apiKey = (options.apiKey ?? process.env.BRAVE_SEARCH_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new WebSearchConfigurationError("BRAVE_SEARCH_API_KEY is required for web search");
  }

  const limit = Math.min(10, Math.max(1, Math.floor(options.limit ?? 5)));
  const endpoint = options.endpoint ?? "https://api.search.brave.com/res/v1/web/search";
  const url = new URL(endpoint);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("count", String(limit));
  const fetcher = options.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
    });
  } catch (error) {
    throw new WebSearchRequestError(error instanceof Error ? error.message : "Web search request failed");
  }

  if (!response.ok) {
    throw new WebSearchRequestError(`Web search provider returned ${response.status}`, response.status >= 500 ? 502 : response.status);
  }

  const payload = (await response.json()) as {
    web?: { results?: Array<{ title?: unknown; url?: unknown; description?: unknown }> };
  };
  return (payload.web?.results ?? [])
    .filter((result) => typeof result.title === "string" && typeof result.url === "string")
    .slice(0, limit)
    .map((result) => ({
      title: result.title as string,
      url: result.url as string,
      snippet: typeof result.description === "string" ? result.description : "",
    }));
}
