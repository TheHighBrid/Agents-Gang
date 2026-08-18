import { afterEach, describe, expect, test } from "vitest";
import { createFounderSessionToken, type FounderSessionClaims } from "../lib/approvals/auth";
import { GET, POST } from "../app/api/jobs/route";

const originalSecret = process.env.FOUNDER_AUTH_SECRET;
const originalRevoked = process.env.FOUNDER_REVOKED_SESSION_IDS;

function token(role: FounderSessionClaims["role"] = "operator") {
  const now = Math.floor(Date.now() / 1000);
  return createFounderSessionToken({
    subject: `${role}-1`,
    role,
    sessionId: `${role}-session`,
    issuedAt: now - 60,
    expiresAt: now + 900,
  }, "operator-route-secret");
}

function request(method: "GET" | "POST", bearer?: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/jobs", {
    method,
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

afterEach(() => {
  if (originalSecret === undefined) delete process.env.FOUNDER_AUTH_SECRET;
  else process.env.FOUNDER_AUTH_SECRET = originalSecret;
  if (originalRevoked === undefined) delete process.env.FOUNDER_REVOKED_SESSION_IDS;
  else process.env.FOUNDER_REVOKED_SESSION_IDS = originalRevoked;
});

describe("protected manual job API", () => {
  test("rejects unsigned role headers before any job handling", async () => {
    process.env.FOUNDER_AUTH_SECRET = "operator-route-secret";
    const response = await GET(request("GET", undefined, undefined, { "x-user-role": "operator" }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Operator authentication required" });
  });

  test("allows signed founder/operator sessions to inspect only the eligible job allowlist", async () => {
    process.env.FOUNDER_AUTH_SECRET = "operator-route-secret";
    for (const role of ["founder", "operator"] as const) {
      const response = await GET(request("GET", token(role)));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ eligibleJobs: ["job.daily_melato_audit"] });
    }
  });

  test("forbids signed viewers", async () => {
    process.env.FOUNDER_AUTH_SECRET = "operator-route-secret";
    const response = await GET(request("GET", token("viewer")));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "Operator authorization required" });
  });

  test("validates the manual-control request before opening execution storage", async () => {
    process.env.FOUNDER_AUTH_SECRET = "operator-route-secret";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await POST(request("POST", token(), { action: "launch", jobName: "job.daily_melato_audit" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_request" });
  });
});
