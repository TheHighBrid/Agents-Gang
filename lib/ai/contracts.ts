export type AIProviderRequest = {
  system: string;
  userMessage: string;
  maxTokens: number;
};

export type AIProviderResponse = {
  text: string;
  provider: string;
  model: string;
};

export type AIProvider = {
  readonly name: string;
  generate(request: AIProviderRequest): Promise<AIProviderResponse>;
};

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly code: "provider_timeout" | "provider_unavailable" | "provider_invalid_response",
    readonly status: number,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export class AIProviderConfigurationError extends Error {
  readonly status = 500;

  constructor(message: string) {
    super(message);
    this.name = "AIProviderConfigurationError";
  }
}
