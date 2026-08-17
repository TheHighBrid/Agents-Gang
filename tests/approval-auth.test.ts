import { describe, expect, test } from "vitest";
import {
  createFounderSessionToken,
  resolveFounderIdentity,
  type FounderSessionClaims,
} from "../lib/approvals/auth";

const secret = "founder-server-secret";
const now = 1_700_000_000;

function requestWithToken(token: string, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/approvals", {
    headers: { Authorization: `Bearer ${token}`, ...headers },
  });
}

function claims(overrides: Partial<FounderSessionClaims> = {}): FounderSessionClaims {
  return {
    subject: "founder-1",
    role: "founder",
    sessionId: "session-1",
    issuedAt: now - 60,
    expiresAt: now + 900,
    ...overrides,
  };
}

describe("trusted founder identity", () => {
  test("rejects anonymous requests and client-supplied role headers", () => {
    const request = new Request("https://example.test/api/approvals", {
      headers: { "x-user-role": "founder" },
    });
    expect(resolveFounderIdentity(request, secret, { now })).toEqual({ ok: false, reason: "unauthorized" });
  });

  test("rejects malformed or tampered session tokens", () => {
    expect(resolveFounderIdentity(requestWithToken("not-a-session"), secret, { now })).toEqual({ ok: false, reason: "unauthorized" });
    const token = createFounderSessionToken(claims(), secret);
    expect(resolveFounderIdentity(requestWithToken(`${token}tampered`), secret, { now })).toEqual({ ok: false, reason: "unauthorized" });
  });

  test("accepts a valid founder session and returns only trusted claims", () => {
    const token = createFounderSessionToken(claims(), secret);
    expect(resolveFounderIdentity(requestWithToken(token), secret, { now })).toEqual({
      ok: true,
      identity: { subject: "founder-1", role: "founder", sessionId: "session-1", expiresAt: now + 900 },
    });
  });

  test("rejects authenticated non-founder sessions with forbidden status", () => {
    const token = createFounderSessionToken(claims({ subject: "operator-1", role: "operator" }), secret);
    expect(resolveFounderIdentity(requestWithToken(token), secret, { now })).toEqual({ ok: false, reason: "forbidden" });
  });

  test("rejects expired and revoked sessions before authorization", () => {
    const expired = createFounderSessionToken(claims({ expiresAt: now - 1 }), secret);
    expect(resolveFounderIdentity(requestWithToken(expired), secret, { now })).toEqual({ ok: false, reason: "unauthorized" });
    const active = createFounderSessionToken(claims(), secret);
    expect(resolveFounderIdentity(requestWithToken(active), secret, { now, revokedSessionIds: new Set(["session-1"]) })).toEqual({ ok: false, reason: "unauthorized" });
  });
});
