import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runContextWebRead, createWebReadingBudget } from "../tools/context-web-read-tool";
import { scrapePublicWebPage, publicWebUrl } from "../tools/contextWebRead";

function fakePayload() {
  return {
    url: "https://docs.example.org/final",
    request_id: "fixture-123",
    isPartial: true,
    markdown: { requested: true, success: true, data: "# Public documentation" },
    json: { requested: true, success: false, data: null, error_code: "NO_DATA", message: "Not found" },
  };
}

describe("Context.dev governed web-reading tool", () => {
  test("keeps independent format failures while preserving source, final URL and cache", async () => {
    const requests: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
    const result = await scrapePublicWebPage({
      url: "https://docs.example.org/start",
      formats: { markdown: true, json: true },
      jsonSchema: { type: "object", properties: { title: { type: ["string", "null"] } } },
      apiKey: "test-key",
      fetcher: async (url, init) => {
        requests.push({ url: String(url), init: init!, body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify(fakePayload()), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.context.dev/v1/web/scrape");
    expect(requests[0].body.maxAgeMs).toBe(21_600_000);
    expect(requests[0].body.timeoutOpts).toEqual({ milliseconds: 20_000 });
    expect(result.sourceUrl).toBe("https://docs.example.org/start");
    expect(result.finalUrl).toBe("https://docs.example.org/final");
    expect(result.isPartial).toBe(true);
    expect(result.outputs.markdown?.data).toBe("# Public documentation");
    expect(result.outputs.json?.error_code).toBe("NO_DATA");
    expect(result.outputs.json?.data).toBeNull();
  });

  test("retains caller-defined schema keys and emits task-specific highlights", async () => {
    let body: Record<string, unknown> = {};
    await scrapePublicWebPage({
      url: "https://docs.example.org/start", apiKey: "test-key",
      formats: { highlights: true, json: true, markdown: true },
      jsonSchema: { type: "object", properties: { camelCase_Field: { type: ["string", "null"] } } },
      highlightsQuery: "license and hardware claims",
      fetcher: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          highlights: { requested: true, success: true, data: ["Supported on CPU"] },
          json: { requested: true, success: true, data: { camelCase_Field: "hello" } },
          markdown: { requested: true, success: true, data: "hello" },
        }));
      },
    });
    expect((body.jsonParams as {schema: {properties: Record<string, unknown>}}).schema.properties).toHaveProperty("camelCase_Field");
    expect(body.highlightsParams).toEqual({ query: "license and hardware claims", maxCharacters: 2000 });
  });

  test("rejects private hosts, URL credentials, ZDR/highlights and untrusted final redirects", async () => {
    for (const url of ["http://127.0.0.1:9000", "https://10.0.0.5", "http://localhost",
      "http://169.254.169.254", "https://username:password@example.org", "http://app.internal"]) {
      expect(() => publicWebUrl(url)).toThrow();
    }
    await expect(scrapePublicWebPage({
      url: "https://example.org", apiKey: "test-key",
      formats: { highlights: true }, highlightsQuery: "topic", zdr: true,
    })).rejects.toThrow(/ZDR/i);
    await expect(scrapePublicWebPage({
      url: "https://example.org", apiKey: "test-key", formats: { markdown: true },
      fetcher: async () => new Response(JSON.stringify({
        url: "http://localhost/internal", markdown: { requested: true, success: true, data: "hidden" },
      })),
    })).rejects.toThrow(/final URL/i);
  });

  test("retry at most one transient response without requesting a real Context.dev page", async () => {
    let attempts = 0;
    const result = await scrapePublicWebPage({
      url: "https://example.org", apiKey: "test-key", formats: { markdown: true },
      fetcher: async () => {
        attempts++;
        return attempts === 1 ? new Response(null, { status: 503 })
          : new Response(JSON.stringify({ markdown: { requested: true, success: true, data: "ok" } }));
      },
    });
    expect(attempts).toBe(2);
    expect(result.outputs.markdown?.data).toBe("ok");
  });

  test("governance audit and run-scoped request limit cannot be bypassed with a second tool call", async () => {
    const repository = createInMemoryExecutionRepository({
      clock: () => new Date("2026-11-23T12:00:00.000Z"),
    });
    const budget = createWebReadingBudget({ maxPerRun: 1 });
    const reader = async () => ({
      sourceUrl: "https://example.org", finalUrl: "https://example.org", retrievedAt: "2026-11-23T12:00:00Z",
      isPartial: false, requestId: "fixture",
      outputs: {
        markdown: { requested: true, success: true, data: "public source", error_code: null, message: null },
      },
    });
    const context = { runId: "task-1", agentName: "trend_radar_agent", repository };
    const first = await runContextWebRead(context, { url: "https://example.org" }, { reader, budget });
    expect(first).toMatchObject({ ok: true, data: { sourceUrl: "https://example.org" } });
    const second = await runContextWebRead(context, { url: "https://example.org" }, { reader, budget });
    expect(second).toMatchObject({ ok: false });
    expect(await repository.listToolCalls()).toMatchObject([
      { toolName: "web.read", capability: "read", riskLevel: 1, outcome: "succeeded" },
      { toolName: "web.read", capability: "read", riskLevel: 1, outcome: "failed" },
    ]);
  });
});
