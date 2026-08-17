import type { ToolCapability, ToolDefinition } from "./tool-execution";
import type { RiskLevel } from "./approval-engine";

export type ToolPolicy = {
  capability: ToolCapability;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
};

const TOOL_POLICIES = {
  "gmail.draft.create": { capability: "draft", riskLevel: 3, approvalRequired: true },
  "gmail.messages.search": { capability: "read", riskLevel: 1, approvalRequired: false },
  "inbox.alert.send": { capability: "execute", riskLevel: 2, approvalRequired: false },
  "product.image.audit": { capability: "read", riskLevel: 1, approvalRequired: false },
  "shopify.collections.read": { capability: "read", riskLevel: 1, approvalRequired: false },
  "shopify.customer.create": { capability: "execute", riskLevel: 3, approvalRequired: true },
  "shopify.customer.update": { capability: "execute", riskLevel: 3, approvalRequired: true },
  "shopify.customers.read": { capability: "read", riskLevel: 1, approvalRequired: false },
  "shopify.inventory.adjust": { capability: "execute", riskLevel: 3, approvalRequired: true },
  "shopify.product.create": { capability: "execute", riskLevel: 3, approvalRequired: true },
  "shopify.product.read": { capability: "read", riskLevel: 1, approvalRequired: false },
  "shopify.product.update": { capability: "execute", riskLevel: 3, approvalRequired: true },
  "shopify.products.read": { capability: "read", riskLevel: 1, approvalRequired: false },
  "shopify.variant.create": { capability: "execute", riskLevel: 3, approvalRequired: true },
  "shopify.variant.update": { capability: "execute", riskLevel: 3, approvalRequired: true },
  "web.search": { capability: "read", riskLevel: 1, approvalRequired: false },
} satisfies Record<string, ToolPolicy>;

export function getEnabledToolNames(): string[] {
  return Object.keys(TOOL_POLICIES);
}

export function getToolPolicy(toolName: string): ToolPolicy | undefined {
  return TOOL_POLICIES[toolName as keyof typeof TOOL_POLICIES];
}

export function assertToolPolicy<Input, Output>(tool: ToolDefinition<Input, Output>): void {
  const policy = getToolPolicy(tool.name);
  if (!policy) {
    throw new Error(`Tool policy is not registered: ${tool.name}`);
  }
  if (
    policy.capability !== tool.capability ||
    policy.riskLevel !== tool.riskLevel
  ) {
    throw new Error(`Tool policy mismatch: ${tool.name}`);
  }
}
