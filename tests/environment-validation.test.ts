import { describe, expect, test } from "vitest";
import {
  environmentInventory,
  validateDeploymentEnvironment,
} from "../lib/config/environment.mjs";

function base(overrides: Record<string, string | undefined> = {}) {
  return {
    AGENTS_GANG_ENVIRONMENT: "staging",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value-that-is-long-enough",
    FOUNDER_AUTH_SECRET: "founder-auth-secret-value-at-least-32-chars",
    AI_ENABLED: "false",
    SHOPIFY_ENABLED: "false",
    GMAIL_ENABLED: "false",
    WEB_SEARCH_ENABLED: "false",
    INBOX_ALERTS_ENABLED: "false",
    GMAIL_SEND_ENABLED: "false",
    ...overrides,
  };
}

describe("deployment environment validation", () => {
  test("allows disabled optional integrations without requiring their credentials", () => {
    const result = validateDeploymentEnvironment(base());
    expect(result.ok).toBe(true);
    expect(result.enabledFeatures).toEqual(["core"]);
    expect(result.disabledFeatures).toEqual(expect.arrayContaining(["ai", "shopify", "gmail", "web_search", "inbox_alerts"]));
  });

  test("requires the service-role credential for all managed environments", () => {
    const staging = validateDeploymentEnvironment(base({ SUPABASE_SERVICE_ROLE_KEY: undefined }));
    expect(staging.ok).toBe(false);
    expect(staging.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ feature: "core", variable: "SUPABASE_SERVICE_ROLE_KEY", code: "required" }),
    ]));

    const production = validateDeploymentEnvironment(base({
      AGENTS_GANG_ENVIRONMENT: "production",
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    }));
    expect(production.ok).toBe(false);
    expect(production.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ feature: "core", variable: "SUPABASE_SERVICE_ROLE_KEY", code: "required" }),
    ]));
  });

  test("validates enabled AI, Gmail, web search, and alert integrations independently", () => {
    const result = validateDeploymentEnvironment(base({
      AI_ENABLED: "true",
      ANTHROPIC_API_KEY: "anthropic-secret-value-long-enough",
      GMAIL_ENABLED: "true",
      GMAIL_ACCESS_TOKEN: "gmail-access-token-value-long-enough",
      GMAIL_REQUEST_TIMEOUT_MS: "10000",
      WEB_SEARCH_ENABLED: "true",
      BRAVE_SEARCH_API_KEY: "brave-search-key-value-long-enough",
      INBOX_ALERTS_ENABLED: "true",
      INBOX_ALERT_WEBHOOK_URL: "https://hooks.example.net/agents-gang/inbox-token",
    }));

    expect(result.ok).toBe(true);
    expect(result.enabledFeatures).toEqual(expect.arrayContaining(["core", "ai", "gmail", "web_search", "inbox_alerts"]));
  });

  test("requires Gmail to be enabled before send capability can be enabled", () => {
    const result = validateDeploymentEnvironment(base({ GMAIL_SEND_ENABLED: "true" }));
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ variable: "GMAIL_SEND_ENABLED", code: "dependency" }),
    ]));
  });

  test("separates Shopify test/staging and production store modes", () => {
    const staging = validateDeploymentEnvironment(base({
      SHOPIFY_ENABLED: "true",
      SHOPIFY_STORE_MODE: "production",
      SHOPIFY_STORE_DOMAIN: "melato.myshopify.com",
      SHOPIFY_ADMIN_ACCESS_TOKEN: "shopify-admin-token-value-long-enough",
    }));
    expect(staging.ok).toBe(false);
    expect(staging.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ variable: "SHOPIFY_STORE_MODE", code: "environment_mismatch" }),
    ]));

    const production = validateDeploymentEnvironment(base({
      AGENTS_GANG_ENVIRONMENT: "production",
      SHOPIFY_ENABLED: "true",
      SHOPIFY_STORE_MODE: "test",
      SHOPIFY_STORE_DOMAIN: "agents-gang-test.myshopify.com",
      SHOPIFY_TEST_STORE_DOMAIN: "agents-gang-test.myshopify.com",
      SHOPIFY_ADMIN_ACCESS_TOKEN: "shopify-admin-token-value-long-enough",
    }));
    expect(production.ok).toBe(false);
    expect(production.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ variable: "SHOPIFY_STORE_MODE", code: "environment_mismatch" }),
    ]));
  });

  test("rejects malformed URLs, timeouts, booleans, weak secrets, and committed-style placeholders", () => {
    const result = validateDeploymentEnvironment(base({
      SUPABASE_URL: "not-a-url",
      FOUNDER_AUTH_SECRET: "short",
      AI_ENABLED: "yes",
      GMAIL_ENABLED: "true",
      GMAIL_ACCESS_TOKEN: "your_gmail_oauth_access_token",
      GMAIL_REQUEST_TIMEOUT_MS: "999999",
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "invalid_url",
      "weak_secret",
      "invalid_boolean",
      "placeholder",
      "out_of_range",
    ]));
  });

  test("never includes secret values in validation errors or serialized results", () => {
    const secret = "VERY-SENSITIVE-SECRET-VALUE-DO-NOT-LOG";
    const result = validateDeploymentEnvironment(base({
      AI_ENABLED: "true",
      ANTHROPIC_API_KEY: secret,
      ANTHROPIC_MODEL: "x".repeat(300),
      FOUNDER_AUTH_SECRET: secret,
    }));
    expect(JSON.stringify(result)).not.toContain(secret);
    for (const error of result.errors) expect(error.message).not.toContain(secret);
  });

  test("exports a typed inventory with risk and secret classification", () => {
    expect(environmentInventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ variable: "SUPABASE_SERVICE_ROLE_KEY", feature: "core", secret: true, risk: 4 }),
      expect.objectContaining({ variable: "FOUNDER_AUTH_SECRET", feature: "core", secret: true, risk: 4 }),
      expect.objectContaining({ variable: "SHOPIFY_ADMIN_ACCESS_TOKEN", feature: "shopify", secret: true, risk: 4 }),
      expect.objectContaining({ variable: "GMAIL_ACCESS_TOKEN", feature: "gmail", secret: true, risk: 4 }),
      expect.objectContaining({ variable: "BRAVE_SEARCH_API_KEY", feature: "web_search", secret: true, risk: 2 }),
    ]));
  });
});
