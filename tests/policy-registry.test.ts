import { describe, expect, test } from "vitest";
import { defineTool } from "../lib/execution/tool-execution";
import {
  TOOL_POLICY_REGISTRY,
  getToolPolicy,
  assertToolPolicy,
} from "../lib/execution/policy-registry";

describe("typed capability and risk policy registry", () => {
  test("covers every enabled tool action exactly once", () => {
    const actions = TOOL_POLICY_REGISTRY.map((policy) => policy.actionType);
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toEqual(expect.arrayContaining([
      "web.search",
      "gmail.messages.search",
      "gmail.draft.create",
      "gmail.draft.send",
      "product.image.audit",
      "inbox.alert.send",
      "shopify.products.read",
      "shopify.product.read",
      "shopify.collections.read",
      "shopify.customers.read",
      "shopify.product.create",
      "shopify.product.update",
      "shopify.customer.create",
      "shopify.customer.update",
      "shopify.inventory.adjust",
      "shopify.variant.create",
      "shopify.variant.update",
    ]));
  });

  test("marks reads as risk 1 and mutating or drafting actions as approval-gated risk 3", () => {
    expect(getToolPolicy("gmail.messages.search")).toMatchObject({ capability: "read", riskLevel: 1, approvalRequired: false });
    expect(getToolPolicy("gmail.draft.create")).toMatchObject({ capability: "draft", riskLevel: 3, approvalRequired: true, targetBinding: "required" });
    expect(getToolPolicy("gmail.draft.send")).toMatchObject({ capability: "execute", riskLevel: 4, approvalRequired: true, targetBinding: "required" });
    expect(getToolPolicy("shopify.product.update")).toMatchObject({ capability: "execute", riskLevel: 3, approvalRequired: true, targetBinding: "required" });
  });

  test("rejects a tool whose declared governance metadata drifts from policy", () => {
    expect(() => assertToolPolicy({ name: "gmail.draft.create", capability: "execute", riskLevel: 1 })).toThrow(/policy mismatch/i);
    expect(() => defineTool({
      name: "gmail.draft.create",
      capability: "execute",
      riskLevel: 1,
      parseInput: () => ({}),
      execute: async () => undefined,
    })).toThrow(/policy mismatch/i);
  });

  test("requires target binding for approval-gated actions that mutate an existing target", () => {
    expect(() => assertToolPolicy({ name: "gmail.draft.create", capability: "draft", riskLevel: 3 })).toThrow(/target binding/i);
  });

  test("rejects unknown actions instead of silently allowing an unregistered capability", () => {
    expect(getToolPolicy("unknown.action")).toBeUndefined();
    expect(() => assertToolPolicy({ name: "unknown.action", capability: "read", riskLevel: 1 })).toThrow(/not registered/i);
  });
});
