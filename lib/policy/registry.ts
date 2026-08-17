export type PolicyCapability = "read" | "draft" | "prepare" | "execute";
export type PolicyExternalEffect = "none" | "read" | "draft" | "notify" | "mutate";
export type PolicyIdempotency = "not_applicable" | "deterministic_key" | "required";

export type ToolPolicy = {
  kind: "tool";
  name: string;
  owner: string;
  capability: PolicyCapability;
  riskLevel: 1 | 2 | 3 | 4 | 5;
  approvalRequired: boolean;
  targetIdentity: string;
  externalEffect: PolicyExternalEffect;
  idempotency: PolicyIdempotency;
  enabled: true;
};

export type JobPolicy = {
  kind: "job";
  name: string;
  owner: string;
  neededTools: string[];
  externalEffect: "none";
  idempotency: "required";
  enabled: true;
};

const readPolicy = (name: string, targetIdentity: string): ToolPolicy => ({
  kind: "tool",
  name,
  owner: "manus",
  capability: "read",
  riskLevel: 1,
  approvalRequired: false,
  targetIdentity,
  externalEffect: "read",
  idempotency: "not_applicable",
  enabled: true,
});

const mutationPolicy = (name: string, targetIdentity: string): ToolPolicy => ({
  kind: "tool",
  name,
  owner: "manus",
  capability: "execute",
  riskLevel: 3,
  approvalRequired: true,
  targetIdentity,
  externalEffect: "mutate",
  idempotency: "required",
  enabled: true,
});

export const ENABLED_TOOL_POLICIES: readonly ToolPolicy[] = [
  readPolicy("gmail.messages.search", "gmail"),
  {
    kind: "tool",
    name: "gmail.draft.create",
    owner: "manus",
    capability: "draft",
    riskLevel: 3,
    approvalRequired: true,
    targetIdentity: "gmail_draft",
    externalEffect: "draft",
    idempotency: "deterministic_key",
    enabled: true,
  },
  readPolicy("product.image.audit", "product_image"),
  {
    kind: "tool",
    name: "inbox.alert.send",
    owner: "manus",
    capability: "execute",
    riskLevel: 2,
    approvalRequired: false,
    targetIdentity: "founder_inbox",
    externalEffect: "notify",
    idempotency: "required",
    enabled: true,
  },
  readPolicy("shopify.customers.read", "shopify_customer"),
  mutationPolicy("shopify.customer.create", "shopify_customer"),
  mutationPolicy("shopify.customer.update", "shopify_customer"),
  mutationPolicy("shopify.inventory.adjust", "shopify_inventory"),
  mutationPolicy("shopify.variant.create", "shopify_variant"),
  mutationPolicy("shopify.variant.update", "shopify_variant"),
  readPolicy("shopify.products.read", "shopify_product"),
  readPolicy("shopify.product.read", "shopify_product"),
  readPolicy("shopify.collections.read", "shopify_collection"),
  mutationPolicy("shopify.product.create", "shopify_product"),
  mutationPolicy("shopify.product.update", "shopify_product"),
  readPolicy("web.search", "public_web"),
];

export const ENABLED_JOB_POLICIES: readonly JobPolicy[] = [
  {
    kind: "job",
    name: "job.daily_melato_audit",
    owner: "manus",
    neededTools: ["shopify.products.read", "product.image.audit"],
    externalEffect: "none",
    idempotency: "required",
    enabled: true,
  },
  {
    kind: "job",
    name: "job.product_page_scan",
    owner: "manus",
    neededTools: ["shopify.products.read"],
    externalEffect: "none",
    idempotency: "required",
    enabled: true,
  },
  {
    kind: "job",
    name: "job.inbox_triage",
    owner: "manus",
    neededTools: ["gmail.messages.search", "inbox.alert.send"],
    externalEffect: "none",
    idempotency: "required",
    enabled: true,
  },
  {
    kind: "job",
    name: "job.weekly_trend_radar",
    owner: "manus",
    neededTools: ["web.search"],
    externalEffect: "none",
    idempotency: "required",
    enabled: true,
  },
];

export function getToolPolicy(name: string) {
  return ENABLED_TOOL_POLICIES.find((policy) => policy.name === name);
}

export function assertPolicyRegistryComplete() {
  const names = [...ENABLED_TOOL_POLICIES, ...ENABLED_JOB_POLICIES].map((policy) => policy.name);
  if (new Set(names).size !== names.length) {
    throw new Error("Policy registry contains duplicate action names");
  }

  for (const policy of ENABLED_TOOL_POLICIES) {
    if ((policy.riskLevel >= 3 || policy.externalEffect === "mutate") && !policy.approvalRequired) {
      throw new Error(`High-risk tool is not approval-gated: ${policy.name}`);
    }
  }

  for (const job of ENABLED_JOB_POLICIES) {
    for (const toolName of job.neededTools) {
      if (!getToolPolicy(toolName)) throw new Error(`Job ${job.name} references an unregistered tool: ${toolName}`);
    }
  }
}

assertPolicyRegistryComplete();
