import { afterEach, describe, expect, test, vi } from "vitest";

import { POST } from "../app/api/chat/route";

const originalProvider = process.env.AI_PROVIDER;
const originalApiKey = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  process.env.AI_PROVIDER = originalProvider;
  process.env.ANTHROPIC_API_KEY = originalApiKey;
  vi.restoreAllMocks();
});

describe("POST /api/chat", () => {
  test("rejects an unsupported explicitly configured provider before handling a chat request", async () => {
    process.env.AI_PROVIDER = "unsupported";
    delete process.env.ANTHROPIC_API_KEY;

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Audit this product page" }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unsupported AI provider: unsupported",
      correlationId: expect.any(String),
    });
  });

  test("logs failed requests with a run ID and without the request payload", async () => {
    process.env.AI_PROVIDER = "unsupported";
    delete process.env.ANTHROPIC_API_KEY;
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "sensitive customer request" }),
      }),
    );

    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({
      event: "chat.request.failed",
      runId: expect.any(String),
      outcome: "failed",
      provider: "unsupported",
    });
    expect(log.mock.calls[0][0]).not.toContain("sensitive customer request");
  });
});


test("returns a correlation ID for failed requests without reflecting request content", async () => {
  process.env.AI_PROVIDER = "unsupported";
  delete process.env.ANTHROPIC_API_KEY;

  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "x-correlation-id": "corr-route-001" },
      body: JSON.stringify({ message: "sensitive customer request" }),
    }),
  );

  expect(response.headers.get("x-correlation-id")).toBe("corr-route-001");
  await expect(response.json()).resolves.toEqual({
    error: "Unsupported AI provider: unsupported",
    correlationId: "corr-route-001",
  });
});
