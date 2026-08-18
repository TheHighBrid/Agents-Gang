import { afterEach, describe, expect, test, vi } from "vitest";
import { createAIProvider } from "../lib/ai/provider-factory";
import { createShopifyGraphQLAdapter } from "../tools/shopify";
import { searchGmailMessages } from "../tools/gmail";
import { createGmailDraft } from "../tools/gmail-draft-tool";
import { sendGmailDraft } from "../tools/gmail-send-tool";
import { webSearch } from "../tools/webSearch";
import { postInboxAlert } from "../tools/inbox-alert";

const original = {
  GMAIL_ENABLED: process.env.GMAIL_ENABLED,
  WEB_SEARCH_ENABLED: process.env.WEB_SEARCH_ENABLED,
  INBOX_ALERTS_ENABLED: process.env.INBOX_ALERTS_ENABLED,
};

function restore(name: keyof typeof original) {
  const value = original[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("GMAIL_ENABLED");
  restore("WEB_SEARCH_ENABLED");
  restore("INBOX_ALERTS_ENABLED");
});

describe("explicit feature disable boundaries", () => {
  test("AI cannot initialize when explicitly disabled even if a key exists", () => {
    expect(() => createAIProvider({
      AI_ENABLED: "false",
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "configured-secret-that-must-not-reactivate-ai",
    })).toThrow("AI integration is disabled");
  });

  test("Shopify cannot initialize when explicitly disabled even with complete credentials", () => {
    expect(() => createShopifyGraphQLAdapter({
      SHOPIFY_ENABLED: "false",
      SHOPIFY_STORE_MODE: "test",
      SHOPIFY_STORE_DOMAIN: "agents-gang-test.myshopify.com",
      SHOPIFY_TEST_STORE_DOMAIN: "agents-gang-test.myshopify.com",
      SHOPIFY_ADMIN_ACCESS_TOKEN: "configured-secret-that-must-not-reactivate-shopify",
    })).toThrow("Shopify adapter is disabled");
  });

  test("Gmail read, draft, and send paths do not make network calls when disabled", async () => {
    process.env.GMAIL_ENABLED = "false";
    const fetcher = vi.fn();

    await expect(searchGmailMessages("is:unread", {
      accessToken: "configured-secret-that-must-not-reactivate-gmail",
      fetcher,
    })).rejects.toThrow("Gmail integration is disabled");

    await expect(createGmailDraft({
      messageId: "message-1",
      threadId: "thread-1",
      to: "founder@example.test",
      subject: "Draft",
      body: "Draft body",
    }, {
      accessToken: "configured-secret-that-must-not-reactivate-gmail",
      fetcher,
    })).rejects.toThrow("Gmail integration is disabled");

    await expect(sendGmailDraft({ draftId: "draft-1" }, {
      accessToken: "configured-secret-that-must-not-reactivate-gmail",
      sendEnabled: true,
      fetcher,
    })).rejects.toThrow("Gmail integration is disabled");

    expect(fetcher).not.toHaveBeenCalled();
  });

  test("web search does not call a provider when explicitly disabled", async () => {
    process.env.WEB_SEARCH_ENABLED = "false";
    const fetcher = vi.fn();

    await expect(webSearch("fashion", {
      apiKey: "configured-secret-that-must-not-reactivate-search",
      fetcher,
    })).rejects.toThrow("Web search integration is disabled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("inbox alerts do not call a webhook when explicitly disabled", async () => {
    process.env.INBOX_ALERTS_ENABLED = "false";
    const fetcher = vi.fn();

    await expect(postInboxAlert([{
      id: "message-1",
      threadId: "thread-1",
      from: "customer@example.test",
      to: "support@example.test",
      subject: "Help",
      receivedAt: "2026-08-18T06:00:00.000Z",
      priority: "high",
      category: "action_required",
    }], {
      webhookUrl: "https://hooks.example.test/secret-path",
      fetcher,
    })).resolves.toBeUndefined();

    expect(fetcher).not.toHaveBeenCalled();
  });
});
