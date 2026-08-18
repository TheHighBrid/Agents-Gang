import type { RiskLevel } from "./approval-engine";
import type { ToolCapability } from "./tool-execution";

export type PolicyExternalEffect = "none" | "read" | "draft" | "notify" | "mutate";
export type PolicyIdempotency = "not_applicable" | "deterministic_key" | "required" | "unsupported";

export type ToolPolicy = {
  kind: "tool";
  actionType: string;
  owner: "manus" | "codex" | "sol-5.6";
  capability: ToolCapability;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  targetBinding: "none" | "required";
  targetIdentity: string;
  externalEffect: PolicyExternalEffect;
  idempotency: PolicyIdempotency;
  enabled: true;
};

export type JobPolicy = {
  kind: "job";
  actionType: string;
  owner: "manus" | "codex" | "sol-5.6";
  neededTools: readonly string[];
  externalEffect: "none";
  idempotency: "required";
  enabled: true;
};

function toolPolicy(input: Omit<ToolPolicy, "kind" | "owner" | "enabled">): ToolPolicy {
  return {
    kind: "tool",
    owner: "manus",
    enabled: true,
    ...input,
  };
}

const readPolicy = (actionType: string, targetIdentity: string): ToolPolicy => toolPolicy({
  actionType,
  capability: "read",
  riskLevel: 1,
  approvalRequired: false,
  targetBinding: "none",
  targetIdentity,
  externalEffect: "read",
  idempotency: "not_applicable",
});

const mutationPolicy = (
  actionType: string,
  targetIdentity: string,
  targetBinding: ToolPolicy["targetBinding"] = "required",
): ToolPolicy => toolPolicy({
  actionType,
  capability: "execute",
  riskLevel: 3,
  approvalRequired: true,
  targetBinding,
  targetIdentity,
  externalEffect: "mutate",
  idempotency: "unsupported",
});

export const TOOL_POLICY_REGISTRY: readonly ToolPolicy[] = Object.freeze([
  readPolicy("web.search", "public_web"),
  readPolicy("gmail.messages.search", "gmail_mailbox"),
  toolPolicy({
    actionType: "gmail.draft.create",
    capability: "draft",
    riskLevel: 3,
    approvalRequired: true,
    targetBinding: "required",
    targetIdentity: "gmail_draft",
    externalEffect: "draft",
    idempotency: "deterministic_key",
  }),
  toolPolicy({
    actionType: "gmail.draft.send",
    capability: "execute",
    riskLevel: 4,
    approvalRequired: true,
    targetBinding: "required",
    targetIdentity: "gmail_draft",
    externalEffect: "mutate",
    idempotency: "unsupported",
  }),
  readPolicy("product.image.audit", "product_image"),
  toolPolicy({
    actionType: "inbox.alert.send",
    capability: "execute",
    riskLevel: 2,
    approvalRequired: false,
    targetBinding: "none",
    targetIdentity: "founder_inbox",
    externalEffect: "notify",
    idempotency: "unsupported",
  }),
  readPolicy("shopify.products.read", "shopify_product_collection"),
  readPolicy("shopify.product.read", "shopify_product"),
  readPolicy("shopify.collections.read", "shopify_collection"),
  readPolicy("shopify.customers.read", "shopify_customer_collection"),
  mutationPolicy("shopify.product.create", "new_shopify_product", "none"),
  mutationPolicy("shopify.product.update", "shopify_product"),
  mutationPolicy("shopify.customer.create", "new_shopify_customer", "none"),
  mutationPolicy("shopify.customer.update", "shopify_customer"),
  mutationPolicy("shopify.inventory.adjust", "shopify_inventory_level"),
  mutationPolicy("shopify.variant.create", "shopify_product"),
  mutationPolicy("shopify.variant.update", "shopify_product"),
]);

export const JOB_POLICY_REGISTRY: readonly JobPolicy[] = Object.freeze([
  {
    kind: "job",
    actionType: "job.daily_melato_audit",
    owner: "manus",
    neededTools: ["shopify.products.read", "product.image.audit"],
    externalEffect: "none",
    idempotency: "required",
    enabled: true,
  },
  {
    kind: "job",
    actionType: "job.product_catalog_audit",
    owner: "manus",
    neededTools: ["shopify.products.read", "product.image.audit"],
    externalEffect: "none",
    idempotency: "required",
    enabled: true,
  },
  {
    kind: "job",
    actionType: "job.product_page_scan",
    owner: "manus",
    neededTools: ["shopify.products.read"],
    externalEffect: "none",
    idempotency: "required",
    enabled: true,
  },
  {
    kind: "job",
    actionType: "job.inbox_triage",
    owner: "manus",
    neededTools: ["gmail.messages.search", "inbox.alert.send"],
    externalEffect: "none",
    idempotency: "required",
    enabled: true,
  },
  {
    kind: "job",
    actionType: "job.weekly_trend_radar",
    owner: "manus",
    neededTools: ["web.search"],
    externalEffect: "none",
    idempotency: "required",
    enabled: true,
  },
]);

const policyByAction = new Map(TOOL_POLICY_REGISTRY.map((policy) => [policy.actionType, policy]));

export function getToolPolicy(actionType: string): ToolPolicy | undefined {
  return policyByAction.get(actionType);
}

export function assertPolicyRegistryComplete(): void {
  const allActionTypes = [...TOOL_POLICY_REGISTRY, ...JOB_POLICY_REGISTRY].map((policy) => policy.actionType);
  if (new Set(allActionTypes).size !== allActionTypes.length) {
    throw new Error("Governance policy registry contains duplicate action types");
  }

  for (const policy of TOOL_POLICY_REGISTRY) {
    if (!policy.owner || !policy.targetIdentity) {
      throw new Error(`Governance policy metadata is incomplete for ${policy.actionType}`);
    }
    if (policy.riskLevel >= 3 && !policy.approvalRequired) {
      throw new Error(`High-risk tool is not approval-gated: ${policy.actionType}`);
    }
    if (policy.externalEffect === "mutate" && !policy.approvalRequired) {
      throw new Error(`Mutating tool is not approval-gated: ${policy.actionType}`);
    }
  }

  for (const policy of JOB_POLICY_REGISTRY) {
    for (const toolName of policy.neededTools) {
      if (!getToolPolicy(toolName)) {
        throw new Error(`Scheduled job ${policy.actionType} references an unregistered tool: ${toolName}`);
      }
    }
  }
}

export function assertToolPolicy(tool: {
  name: string;
  capability: ToolCapability;
  riskLevel: RiskLevel;
  getTarget?: unknown;
}): ToolPolicy {
  const policy = getToolPolicy(tool.name);
  if (!policy) throw new Error(`Tool action is not registered in the governance policy: ${tool.name}`);
  if (policy.capability !== tool.capability || policy.riskLevel !== tool.riskLevel) {
    throw new Error(`Tool governance policy mismatch for ${tool.name}`);
  }
  if (policy.targetBinding === "required" && typeof tool.getTarget !== "function") {
    throw new Error(`Tool governance policy requires target binding for ${tool.name}`);
  }
  return policy;
}

assertPolicyRegistryComplete();
