import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import type { ProductImageAuditor } from "../tools/image-audit-tool";
import type { ShopifyProductsReader } from "../tools/shopify-products-tool";
import { runGovernedJob } from "./governedJob";
import { runProductAudit } from "./productAudit";

/** Run the store-health audit inside an existing governed execution. */
export function runDailyMelatoAudit(
  context: ToolExecutionContext,
  reader?: ShopifyProductsReader,
  auditor?: ProductImageAuditor,
) {
  return runProductAudit(context, reader, auditor);
}

/** Create the durable run and route records used by the scheduled daily audit. */
export function runDailyMelatoAuditJob(
  repository: ToolExecutionContext["repository"],
  reader?: ShopifyProductsReader,
  auditor?: ProductImageAuditor,
) {
  return runGovernedJob({
    repository,
    agentName: "shopify_ops_agent",
    inputSummary: "Scheduled daily Melato store health audit",
    reason: "Review product metadata and imagery for daily store-health issues",
    neededTools: ["shopify.products.read", "product.image.audit"],
    execute: (context) => runDailyMelatoAudit(context, reader, auditor),
  });
}
