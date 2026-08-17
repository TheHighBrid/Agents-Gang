import { describe, expect, test } from "vitest";
import { defineTool } from "../lib/execution/tool-execution";
import { getEnabledToolNames, getToolPolicy } from "../lib/execution/tool-policy";

describe("capability and risk policy registry", () => {
  test("registers every enabled tool with its governed capability and risk", () => {
    const expected = [
      "gmail.draft.create",
      "gmail.messages.search",
      "inbox.alert.send",
      "product.image.audit",
      "shopify.collections.read",
      "shopify.customer.create",
      "shopify.customer.update",
      "shopify.customers.read",
      "shopify.inventory.adjust",
      "shopify.product.create",
      "shopify.product.read",
      "shopify.product.update",
      "shopify.products.read",
      "shopify.variant.create",
      "shopify.variant.update",
      "web.search",
    ];

    expect(getEnabledToolNames()).toEqual(expected);
    expect(getToolPolicy("shopify.product.update")).toMatchObject({
      capability: "execute",
      riskLevel: 3,
      approvalRequired: true,
    });
    expect(getToolPolicy("shopify.product.read")).toMatchObject({
      capability: "read",
      riskLevel: 1,
      approvalRequired: false,
    });
  });

  test("rejects an enabled tool whose definition is missing from the registry", () => {
    expect(() => defineTool({
      name: "unregistered.tool",
      capability: "read",
      riskLevel: 1,
      parseInput: (input: unknown) => input,
      execute: async (input: unknown) => input,
    })).toThrow("Tool policy is not registered: unregistered.tool");
  });

  test("rejects tool metadata that drifts from its registered policy", () => {
    expect(() => defineTool({
      name: "shopify.product.update",
      capability: "read",
      riskLevel: 1,
      parseInput: (input: unknown) => input,
      execute: async (input: unknown) => input,
    })).toThrow("Tool policy mismatch: shopify.product.update");
  });
});
