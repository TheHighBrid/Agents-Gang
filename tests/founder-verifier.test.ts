import { afterEach, describe, expect, test } from "vitest";
import { GET } from "../app/api/founder/verify/route";
import { createFounderSessionToken } from "../lib/approvals/auth";

const originalFounderSecret = process.env.FOUNDER_AUTH_SECRET;

function restoreFounderSecret() {
  if (originalFounderSecret === undefined) delete process.env.FOUNDER_AUTH_SECRET;
  else process.env.FOUNDER_AUTH_SECRET = originalFounderSecret;
}

afterEach(restoreFounderSecret);

function founderToken(secret: string) {
  const now = Math.floor(Date.now() / 1000);
  return createFounderSessionToken({
    subject: "staging-founder",
    role: "founder",
    sessionId: "bridge-verifier-session",
    issuedAt: now,
    expiresAt: now + 60,
  }, secret);
}

describe("founder session verifier", () => {
  test("fails closed when the bearer session is missing or invalid", async () => {
    process.env.FOUNDER_AUTH_SECRET = "synthetic-founder-auth-secret-value-at-least-32-characters";

    const missing = await GET(new Request("https://example.test/api/founder/verify"));
    expect(missing.status).toBe(401);
    expect(missing.headers.get("cache-control")).toContain("no-store");

    const invalid = await GET(new Request("https://example.test/api/founder/verify", {
      headers: { Authorization: "Bearer invalid-session" },
    }));
    expect(invalid.status).toBe(401);
  });

  test("returns only minimal founder identity for a valid session", async () => {
    const secret = "synthetic-founder-auth-secret-value-at-least-32-characters";
    process.env.FOUNDER_AUTH_SECRET = secret;
    const token = founderToken(secret);

    const response = await GET(new Request("https://example.test/api/founder/verify", {
      headers: { Authorization: `Bearer ${token}` },
    }));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toEqual(expect.objectContaining({ ok: true, role: "founder", subject: "staging-founder" }));
    expect(body).not.toHaveProperty("token");
    expect(body).not.toHaveProperty("sessionId");
  });
});
