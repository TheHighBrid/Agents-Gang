import { describe, expect, test } from "vitest";

import { AnthropicProvider, AIProviderError } from "../lib/ai/anthropic-provider";

describe("AnthropicProvider", () => {
  test("converts a provider timeout into a typed provider-neutral error", async () => {
    const provider = new AnthropicProvider({
      apiKey: "test-key",
      model: "claude-test",
      request: async () => {
        const error = new Error("request timed out");
        error.name = "TimeoutError";
        throw error;
      },
    });

    await expect(
      provider.generate({
        system: "system prompt",
        userMessage: "hello",
        maxTokens: 100,
      }),
    ).rejects.toMatchObject({
      name: AIProviderError.name,
      code: "provider_timeout",
      status: 503,
      message: "AI provider request timed out",
    });
  });
});
