import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { POST } from "../app/api/founder/session/route";
import { resolveFounderIdentity } from "../lib/approvals/auth";

const root = process.cwd();
const signingKey = "synthetic-founder-access-value-0123456789";
const originalEnvironment = process.env.AGENTS_GANG_ENVIRONMENT;
const originalKey = process.env.FOUNDER_AUTH_SECRET;

afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.AGENTS_GANG_ENVIRONMENT;
  else process.env.AGENTS_GANG_ENVIRONMENT = originalEnvironment;

  if (originalKey === undefined) delete process.env.FOUNDER_AUTH_SECRET;
  else process.env.FOUNDER_AUTH_SECRET = originalKey;
});

function signInRequest(accessSecret: string) {
  return new Request("https://example.test/api/founder/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessSecret }),
  });
}

describe("staging founder sign-in", () => {
  test("exchanges the matching staging access value for a short-lived founder session", async () => {
    process.env.AGENTS_GANG_ENVIRONMENT = "staging";
    process.env.FOUNDER_AUTH_SECRET = signingKey;

    const response = await POST(signInRequest(signingKey));
    const body = await response.json() as { token: string; expiresAt: number };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.token).toMatch(/^v1\./);
    expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const identity = resolveFounderIdentity(
      new Request("https://example.test/api/dashboard", {
        headers: { Authorization: `Bearer ${body.token}` },
      }),
      signingKey,
    );
    expect(identity.ok).toBe(true);
    if (identity.ok) expect(identity.identity.role).toBe("founder");
  });

  test("fails closed for a mismatch and outside staging", async () => {
    process.env.AGENTS_GANG_ENVIRONMENT = "staging";
    process.env.FOUNDER_AUTH_SECRET = signingKey;
    const denied = await POST(signInRequest("not-the-configured-value"));
    expect(denied.status).toBe(401);
    expect(await denied.json()).toEqual({ error: "Founder authentication failed" });

    process.env.AGENTS_GANG_ENVIRONMENT = "production";
    const unavailable = await POST(signInRequest(signingKey));
    expect(unavailable.status).toBe(404);
  });

  test("deployed dashboard exchanges the founder access secret for an in-memory session", () => {
    const page = readFileSync(join(root, "app/dashboard/page.tsx"), "utf8");
    expect(page).toContain("Founder access secret");
    expect(page).toContain("/api/founder/session");
    expect(page).toContain("/api/dashboard");
    expect(page).toContain("Sign in and load operations");
    expect(page).toContain("Authorization: `Bearer ${session}`");
    expect(page).not.toContain("Authentication disabled");
    expect(page).not.toContain("localStorage");
    expect(page).not.toContain("sessionStorage");
  });
});
