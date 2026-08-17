import { describe, expect, test } from "vitest";
import { defineTool } from "../lib/execution/tool-execution";
import {
  ENABLED_JOB_POLICIES,
  ENABLED_TOOL_POLICIES,
  assertPolicyRegistryComplete,
  getToolPolicy,
} from "../lib/policy/registry";

describe("capability and risk policy registry", () => {
  test("covers every enabled tool with typed governance metadata", () => {
    assertPolicyRegistryComplete();
    expect(ENABLED_TOOL_POLICIES.length).toBeGreaterThanOrEqual(16);

    for (const policy of ENABLED_TOOL_POLICIES) {
      expect(policy.name).toBeTruthy();
      expect(policy.owner).toBeTruthy();
      expect(["read", "draft", "prepare", "execute"]).toContain(policy.capability);
      expect([1, 2, 3, 4, 5]).toContain(policy.riskLevel);
      expect(typeof policy.approvalRequired).toBe("boolean");
      expect(policy.targetIdentity).toBeTruthy();
      expect(["none", "read", "draft", "notify", "mutate"]).toContain(policy.externalEffect);
      expect(["not_applicable", "deterministic_key", "required"]).toContain(policy.idempotency);
      expect(policy.enabled).toBe(true);
    }
  });

  test("covers every enabled scheduled job action and references only registered tools", () => {
    expect(ENABLED_JOB_POLICIES.map((policy) => policy.name)).toEqual(expect.arrayContaining([
      "job.daily_melato_audit",
      "job.product_page_scan",
      "job.inbox_triage",
      "job.weekly_trend_radar",
    ]));

    for (const job of ENABLED_JOB_POLICIES) {
      expect(job.owner).toBeTruthy();
      expect(job.externalEffect).toBe("none");
      expect(job.idempotency).toBe("required");
      expect(job.enabled).toBe(true);
      for (const toolName of job.neededTools) {
        expect(getToolPolicy(toolName)).toBeDefined();
      }
    }
  });

  test("rejects registered tool definitions that drift from policy metadata", () => {
    expect(() => defineTool({
      name: "shopify.product.update",
      capability: "read",
      riskLevel: 1,
      parseInput: (input: unknown) => input,
      execute: async (input: unknown) => input,
    })).toThrow("Tool definition does not match policy registry");
  });

  test("keeps high-risk external mutations approval-gated", () => {
    for (const policy of ENABLED_TOOL_POLICIES) {
      if (policy.riskLevel >= 3 || policy.externalEffect === "mutate") {
        expect(policy.approvalRequired, policy.name).toBe(true);
      }
    }
  });
});
