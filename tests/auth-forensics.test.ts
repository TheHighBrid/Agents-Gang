import { describe, expect, test } from "vitest";
import { POST } from "../app/api/founder/session/route";
import { resolveFounderIdentity } from "../lib/approvals/auth";
import { issueFounderSession } from "../scripts/create-founder-session.mjs";

const logicalSecret = "synthetic-founder-access-value-0123456789";
const paddedSecret = `  ${logicalSecret}  `;

function signInRequest(accessSecret: string) {
  return new Request("https://example.test/api/founder/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessSecret }),
  });
}

describe("founder auth forensics", () => {
  test("direct staging sign-in normalizes the configured and submitted values consistently", async () => {
    const originalEnvironment = process.env.AGENTS_GANG_ENVIRONMENT;
    const originalSecret = process.env.FOUNDER_AUTH_SECRET;
    try {
      process.env.AGENTS_GANG_ENVIRONMENT = "staging";
      process.env.FOUNDER_AUTH_SECRET = paddedSecret;

      const response = await POST(signInRequest(logicalSecret));
      const body = await response.json() as { token?: string };

      expect(response.status).toBe(200);
      expect(body.token).toMatch(/^v1\./);
    } finally {
      if (originalEnvironment === undefined) delete process.env.AGENTS_GANG_ENVIRONMENT;
      else process.env.AGENTS_GANG_ENVIRONMENT = originalEnvironment;
      if (originalSecret === undefined) delete process.env.FOUNDER_AUTH_SECRET;
      else process.env.FOUNDER_AUTH_SECRET = originalSecret;
    }
  });

  test("local issuer and server verifier treat the same logical secret consistently", () => {
    const now = 1_787_153_000;
    const token = issueFounderSession({
      secret: paddedSecret,
      subject: "founder-forensics",
      ttlSeconds: 900,
      now,
      sessionId: "forensics-session",
    });

    const result = resolveFounderIdentity(
      new Request("https://example.test/api/dashboard", {
        headers: { authorization: `Bearer ${token}` },
      }),
      logicalSecret,
      { now: now + 1 },
    );

    expect(result.ok).toBe(true);
  });

  test("direct staging sign-in returns 401 only for an actual value mismatch", async () => {
    const originalEnvironment = process.env.AGENTS_GANG_ENVIRONMENT;
    const originalSecret = process.env.FOUNDER_AUTH_SECRET;
    try {
      process.env.AGENTS_GANG_ENVIRONMENT = "staging";
      process.env.FOUNDER_AUTH_SECRET = logicalSecret;

      const response = await POST(signInRequest("different-founder-value-0123456789"));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Founder authentication failed" });
    } finally {
      if (originalEnvironment === undefined) delete process.env.AGENTS_GANG_ENVIRONMENT;
      else process.env.AGENTS_GANG_ENVIRONMENT = originalEnvironment;
      if (originalSecret === undefined) delete process.env.FOUNDER_AUTH_SECRET;
      else process.env.FOUNDER_AUTH_SECRET = originalSecret;
    }
  });
});
