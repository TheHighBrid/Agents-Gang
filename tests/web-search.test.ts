import { describe, expect, test, vi } from "vitest";
import { webSearch, WebSearchConfigurationError, WebSearchRequestError } from "../tools/webSearch";

describe("web search tool", () => {
  test("rejects blank queries before calling the provider", async () => {
    const fetcher = vi.fn();
    await expect(webSearch("   ", { apiKey: "secret", fetcher })).rejects.toThrow("Search query is required");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("normalizes Brave results and caps the requested result count", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      web: { results: [
        { title: "First", url: "https://example.test/first", description: "One" },
        { title: "Second", url: "https://example.test/second", description: "Two" },
      ] },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const results = await webSearch("  Melato sizing  ", { apiKey: "secret", limit: 1, fetcher });

    expect(results).toEqual([{ title: "First", url: "https://example.test/first", snippet: "One" }]);
    const [requestUrl, requestInit] = fetcher.mock.calls[0] || [];
    const parsedUrl = new URL(String(requestUrl));
    expect(parsedUrl.origin + parsedUrl.pathname).toBe("https://api.search.brave.com/res/v1/web/search");
    expect(parsedUrl.searchParams.get("q")).toBe("Melato sizing");
    expect(parsedUrl.searchParams.get("count")).toBe("1");
    expect(requestInit).toEqual(expect.objectContaining({ headers: expect.objectContaining({ "X-Subscription-Token": "secret" }) }));
  });

  test("returns a configuration error when no provider key is available", async () => {
    await expect(webSearch("Melato", { apiKey: "" })).rejects.toBeInstanceOf(WebSearchConfigurationError);
  });

  test("turns provider failures into a typed request error", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("upstream failure", { status: 503 }));
    await expect(webSearch("Melato", { apiKey: "secret", fetcher })).rejects.toBeInstanceOf(WebSearchRequestError);
  });
});
