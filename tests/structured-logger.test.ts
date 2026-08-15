import { describe, expect, test } from "vitest";

import { createStructuredLogger } from "../lib/observability/structured-logger";

describe("structured logger", () => {
  test("emits execution correlation fields without raw payloads", () => {
    const events: unknown[] = [];
    const logger = createStructuredLogger({ write: (event) => events.push(event) });

    logger.record({
      event: "chat.request.completed",
      runId: "run-1",
      agent: "product_page_agent",
      route: "product_page_agent",
      provider: "anthropic",
      durationMs: 42,
      outcome: "succeeded",
      payload: { apiKey: "secret", customerMessage: "sensitive request" },
    });

    expect(events).toEqual([
      {
        event: "chat.request.completed",
        runId: "run-1",
        agent: "product_page_agent",
        route: "product_page_agent",
        provider: "anthropic",
        durationMs: 42,
        outcome: "succeeded",
      },
    ]);
  });
});
