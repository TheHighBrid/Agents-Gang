import type { RiskLevel } from "./approval-engine";
import type { ToolCapability } from "./tool-execution";

export type ToolPolicy = {
  actionType: string;
  capability: ToolCapability;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  targetBinding: "none" | "required";
};

const readPolicy = (actionType: string): ToolPolicy => ({
  actionType,
  capability: "read",
  riskLevel: 1,
  approvalRequired: false,
  targetBinding: "none",
});

const executePolicy = (actionType: string, targetBinding: ToolPolicy["targetBinding"] = "required"): ToolPolicy => ({
  actionType,
  capability: "execute",
  riskLevel: 3,
  approvalRequired: true,
  targetBinding,
});

const draftPolicy = (actionType: string): ToolPolicy => ({
  actionType,
  capability: "draft",
  riskLevel: 3,
  approvalRequired: true,
  targetBinding: "required",
});

const alertPolicy = (actionType: string): ToolPolicy => ({
  actionType,
  capability: "execute",
  riskLevel: 2,
  approvalRequired: false,
  targetBinding: "none",
});

export const TOOL_POLICY_REGISTRY: readonly ToolPolicy[] = Object.freeze([
  readPolicy("web.search"),
  readPolicy("gmail.messages.search"),
  draftPolicy("gmail.draft.create"),
  readPolicy("product.image.audit"),
  alertPolicy("inbox.alert.send"),
  readPolicy("shopify.products.read"),
  readPolicy("shopify.product.read"),
  readPolicy("shopify.collections.read"),
  readPolicy("shopify.customers.read"),
  executePolicy("shopify.product.create", "none"),
  executePolicy("shopify.product.update"),
  executePolicy("shopify.customer.create", "none"),
  executePolicy("shopify.customer.update"),
  executePolicy("shopify.inventory.adjust"),
  executePolicy("shopify.variant.create", "none"),
  executePolicy("shopify.variant.update"),
]);

const policyByAction = new Map(TOOL_POLICY_REGISTRY.map((policy) => [policy.actionType, policy]));

export function getToolPolicy(actionType: string): ToolPolicy | undefined {
  return policyByAction.get(actionType);
}

export function assertToolPolicy(tool: {
  name: string;
  capability: ToolCapability;
  riskLevel: RiskLevel;
  getTarget?: unknown;
}): void {
  const policy = getToolPolicy(tool.name);
  if (!policy) throw new Error(`Tool action is not registered in the governance policy: ${tool.name}`);
  if (policy.capability !== tool.capability || policy.riskLevel !== tool.riskLevel) {
    throw new Error(`Tool governance policy mismatch for ${tool.name}`);
  }
  if (policy.targetBinding === "required" && typeof tool.getTarget !== "function") {
    throw new Error(`Tool governance policy requires target binding for ${tool.name}`);
  }
}
