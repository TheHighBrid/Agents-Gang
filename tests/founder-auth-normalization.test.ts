import { describe, expect, test } from "vitest";
import {
  createFounderSessionToken,
  resolveFounderIdentity,
  type FounderSessionClaims,
} from "../lib/approvals/auth";

const signingKey = "synthetic-test-key-material-0123456789";
const now = 1_700_000_000;

function claims(): FounderSessionClaims {
  return {
    subject: "founder-1",
    role: "founder",
    sessionId: "session-normalization",
    issuedAt: now - 60,
    expiresAt: now + 900,
  };
}

describe("founder auth configuration normalization", () => {
  test("accepts a token when configured key has accidental surrounding whitespace", () => {
    const token = createFounderSessionToken(claims(), signingKey);
    const request = new Request("https://example.test/api/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(resolveFounderIdentity(request, `  ${signingKey}\n`, { now })).toEqual({
      ok: true,
      identity: {
        subject: "founder-1",
        role: "founder",
        sessionId: "session-normalization",
        expiresAt: now + 900,
      },
    });
  });
});
