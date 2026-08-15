import {
  AIProviderConfigurationError,
  type AIProvider,
} from "./contracts";
import { AnthropicProvider } from "./anthropic-provider";

type ProviderEnvironment = Record<string, string | undefined>;

export function createAIProvider(environment: ProviderEnvironment): AIProvider {
  const providerName = environment.AI_PROVIDER ?? "anthropic";

  if (providerName !== "anthropic") {
    throw new AIProviderConfigurationError(`Unsupported AI provider: ${providerName}`);
  }

  if (!environment.ANTHROPIC_API_KEY) {
    throw new AIProviderConfigurationError("ANTHROPIC_API_KEY is not configured");
  }

  return new AnthropicProvider({
    apiKey: environment.ANTHROPIC_API_KEY,
    model: environment.ANTHROPIC_MODEL ?? "claude-opus-4-8",
  });
}
