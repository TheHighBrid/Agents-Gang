import { describe, expect, test } from "vitest";
import {
  createFounderSessionToken,
  resolveOperatorIdentity,
  type FounderSessionClaims,
} from "../lib/approvals/auth";

const secret = "founder-server-secret";
const now = 1_700_000_000;

function claims(role: FounderSessionClaims["role"], overrides: Partial<FounderSessionClaims> = {}): FounderSessionClaims {
  return {
    subject: `${role}-1`,
    role,
    sessionId: `${role}-session`,
    issuedAt: now - 60,
    expiresAt: now + 900,
    ...overrides,
  };
}

function requestWithToken(token: string, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/jobs", {
    headers: { Authorization: `Bearer ${token}`, ...headers },
  });
}

describe("trusted operator identity", () => {
  test("accepts signed founder and operator sessions", () => {
    for (const role of ["founder", "operator"] as const) {
      const token = createFounderSessionToken(claims(role), secret);
      expect(resolveOperatorIdentity(requestWithToken(token), secret, { now })).toEqual({
        ok: true,
        identity: {
          subject: `${role}-1`,
          role,
          sessionId: `${role}-session`,
          expiresAt: now + 900,
        },
      });
    }
  });

  test("rejects viewers and ignores client-supplied operator headers", () => {
    const viewer = createFounderSessionToken(claims("viewer"), secret);
    expect(resolveOperatorIdentity(requestWithToken(viewer), secret, { now })).toEqual({ ok: false, reason: "forbidden" });

    const unsigned = new Request("https://example.test/api/jobs", {
      headers: { "x-user-role": "operator", "x-operator-id": "forged" },
    });
    expect(resolveOperatorIdentity(unsigned, secret, { now })).toEqual({ ok: false, reason: "unauthorized" });
  });

  test("rejects expired and revoked operator sessions", () => {
    const expired = createFounderSessionToken(claims("operator", { expiresAt: now - 1 }), secret);
    expect(resolveOperatorIdentity(requestWithToken(expired), secret, { now })).toEqual({ ok: false, reason: "unauthorized" });

    const active = createFounderSessionToken(claims("operator"), secret);
    expect(resolveOperatorIdentity(requestWithToken(active), secret, {
      now,
      revokedSessionIds: new Set(["operator-session"]),
    })).toEqual({ ok: false, reason: "unauthorized" });
  });
});
