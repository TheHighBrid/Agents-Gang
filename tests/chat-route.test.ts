import { afterEach, describe, expect, test, vi } from "vitest";

import { POST } from "../app/api/chat/route";

const originalProvider = process.env.AI_PROVIDER;
const originalApiKey = process.env.ANTHROPIC_API_KEY;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnvironment("AI_PROVIDER", originalProvider);
  restoreEnvironment("ANTHROPIC_API_KEY", originalApiKey);
  vi.restoreAllMocks();
});

describe("POST /api/chat", () => {
  test("rejects an unsupported explicitly configured provider with a correlation response header", async () => {
    process.env.AI_PROVIDER = "unsupported";
    delete process.env.ANTHROPIC_API_KEY;

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "x-correlation-id": "corr.chat:test-001" },
        body: JSON.stringify({ message: "Audit this product page" }),
      }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("x-correlation-id")).toBe("corr.chat:test-001");
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported AI provider: unsupported",
    });
  });

  test("logs failed requests with correlation ID, no fake durable run ID, and no request payload", async () => {
    process.env.AI_PROVIDER = "unsupported";
    delete process.env.ANTHROPIC_API_KEY;
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "x-correlation-id": "corr.chat:failure-001" },
        body: JSON.stringify({ message: "sensitive customer request" }),
      }),
    );

    expect(log).toHaveBeenCalledOnce();
    const event = JSON.parse(log.mock.calls[0][0] as string);
    expect(event).toMatchObject({
      event: "chat.request.failed",
      correlationId: "corr.chat:failure-001",
      outcome: "failed",
      provider: "unsupported",
    });
    expect(event).not.toHaveProperty("runId");
    expect(log.mock.calls[0][0]).not.toContain("sensitive customer request");
  });
});
