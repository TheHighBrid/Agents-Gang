import {
  AIProviderError,
  type AIProvider,
  type AIProviderRequest,
  type AIProviderResponse,
} from "./contracts";

export { AIProviderError } from "./contracts";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type AnthropicProviderOptions = {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  request?: FetchLike;
};

type AnthropicResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly request: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: AnthropicProviderOptions) {
    this.request = options.request ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async generate(request: AIProviderRequest): Promise<AIProviderResponse> {
    let response: Response;
    try {
      response = await this.request("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: "user", content: request.userMessage }],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AIProviderError("AI provider request timed out", "provider_timeout", 503);
      }
      throw new AIProviderError("AI provider could not be reached", "provider_unavailable", 503);
    }

    if (!response.ok) {
      throw new AIProviderError(
        `AI provider returned status ${response.status}`,
        "provider_unavailable",
        502,
      );
    }

    let payload: AnthropicResponse;
    try {
      payload = (await response.json()) as AnthropicResponse;
    } catch {
      throw new AIProviderError(
        "AI provider returned malformed JSON",
        "provider_invalid_response",
        502,
      );
    }

    const text = payload.content?.find(
      (block) => block?.type === "text" && typeof block.text === "string",
    )?.text;
    if (!text) {
      throw new AIProviderError(
        "AI provider returned an invalid response",
        "provider_invalid_response",
        502,
      );
    }

    return {
      text,
      provider: this.name,
      model: this.options.model,
    };
  }
}
