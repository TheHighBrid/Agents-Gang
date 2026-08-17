import { describe, expect, test } from "vitest";
import { isApprovalApiAuthorized } from "../lib/approvals/auth";

describe("approval API authentication", () => {
  test("rejects requests without a bearer token", () => {
    const request = new Request("https://example.test/api/approvals");

    expect(isApprovalApiAuthorized(request, "founder-secret")).toBe(false);
  });

  test("rejects a token that does not match the configured secret", () => {
    const request = new Request("https://example.test/api/approvals", {
      headers: { Authorization: "Bearer wrong-secret" },
    });

    expect(isApprovalApiAuthorized(request, "founder-secret")).toBe(false);
  });

  test("accepts the configured bearer token", () => {
    const request = new Request("https://example.test/api/approvals", {
      headers: { Authorization: "Bearer founder-secret" },
    });

    expect(isApprovalApiAuthorized(request, "founder-secret")).toBe(true);
  });
});
