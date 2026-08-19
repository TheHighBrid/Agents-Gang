import { describe, expect, test } from "vitest";
import { resolveFounderIdentity } from "../lib/approvals/auth";
import {
  issueFounderSession,
  parseFounderSessionArgs,
} from "../scripts/create-founder-session.mjs";

const secret = "staging-founder-auth-secret-32-chars-minimum";

describe("founder session issuer", () => {
  test("issues a short-lived founder token accepted by the server verifier", () => {
    const now = 1_787_128_800;
    const sessionId = "session-c5-04-uat";
    const token = issueFounderSession({
      secret,
      subject: "founder-uat",
      ttlSeconds: 900,
      now,
      sessionId,
    });

    const request = new Request("https://staging.example.test/api/dashboard", {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = resolveFounderIdentity(request, secret, { now: now + 1 });

    expect(result).toEqual({
      ok: true,
      identity: {
        subject: "founder-uat",
        role: "founder",
        sessionId,
        expiresAt: now + 900,
      },
    });
  });

  test("refuses missing or weak secrets and unsafe session lifetimes", () => {
    expect(() => issueFounderSession({ secret: "", subject: "founder" })).toThrow(/secret/i);
    expect(() => issueFounderSession({ secret: "too-short", subject: "founder" })).toThrow(/32/);
    expect(() => issueFounderSession({ secret, subject: "founder", ttlSeconds: 59 })).toThrow(/ttl/i);
    expect(() => issueFounderSession({ secret, subject: "founder", ttlSeconds: 3601 })).toThrow(/ttl/i);
  });

  test("keeps role fixed to founder and validates bounded non-sensitive subjects", () => {
    const token = issueFounderSession({
      secret,
      subject: "mo.staging-founder",
      now: 1_787_128_800,
      sessionId: "bounded-session",
    });
    expect(token.startsWith("v1.")).toBe(true);
    expect(() => issueFounderSession({ secret, subject: "" })).toThrow(/subject/i);
    expect(() => issueFounderSession({ secret, subject: "x".repeat(129) })).toThrow(/subject/i);
    expect(() => issueFounderSession({ secret, subject: "founder\nadmin" })).toThrow(/subject/i);
  });

  test("does not accept the founder secret as a command-line argument", () => {
    expect(parseFounderSessionArgs(["--subject", "founder-uat", "--ttl-seconds", "600"])).toEqual({
      subject: "founder-uat",
      ttlSeconds: 600,
    });
    expect(() => parseFounderSessionArgs(["--secret", secret])).toThrow(/secret.*environment/i);
    expect(() => parseFounderSessionArgs(["--ttl-seconds", "not-a-number"])).toThrow(/ttl/i);
  });
});
