import { describe, expect, test } from "vitest";

import { evaluateApprovalGate } from "../lib/execution/approval-engine";

describe("approval gate", () => {
  test("blocks a level-3 action when no approval exists", () => {
    const result = evaluateApprovalGate({
      riskLevel: 3,
      approval: undefined,
    });

    expect(result).toEqual({
      allowed: false,
      reason: "approval_required",
    });
  });

  test("rejects an invalid runtime risk level", () => {
    expect(() =>
      evaluateApprovalGate({
        riskLevel: 0 as 1,
      }),
    ).toThrow("Risk level must be an integer from 1 to 4");
  });

  test("blocks an approved record after its expiry timestamp", () => {
    const result = evaluateApprovalGate({
      riskLevel: 4,
      approval: {
        status: "approved",
        expiresAt: "2026-08-15T12:00:00.000Z",
      },
      now: new Date("2026-08-15T12:00:01.000Z"),
    });

    expect(result).toEqual({
      allowed: false,
      reason: "approval_expired",
    });
  });
});
