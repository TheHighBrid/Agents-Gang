import { describe, expect, test } from "vitest";

import { createAIProvider } from "../lib/ai/provider-factory";

describe("AI provider factory", () => {
  test("creates the configured Anthropic adapter", () => {
    const provider = createAIProvider({
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-key",
      ANTHROPIC_MODEL: "claude-test",
    });

    expect(provider.name).toBe("anthropic");
  });
});
