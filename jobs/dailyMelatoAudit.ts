import type { ExecutionRepository } from "../lib/execution/repository";
import type { ShopifyProductsReader } from "../tools/shopify-products-tool";
import { runProductPageScan } from "./productPageScan";
import { runScheduledJob } from "./scheduledJobRunner";

export function runDailyMelatoAudit(
  repository: ExecutionRepository,
  reader?: ShopifyProductsReader,
  controls?: { idempotencyKey?: string; correlationId?: string },
) {
  return runScheduledJob(repository, {
    idempotencyKey: controls?.idempotencyKey ?? "daily-melato-audit",
    correlationId: controls?.correlationId,
    agentName: "shopify_ops_agent",
    provider: "system",
    model: "governed-tool-runner",
    routeAgent: "shopify_ops_agent",
    riskLevel: 1,
    inputSummary: "Daily Melato store-health audit.",
    reason: "The daily schedule requested a governed Shopify store-health audit.",
    neededTools: ["shopify.products.read"],
    execute: async ({ runId, correlationId }) => {
      const result = await runProductPageScan(
        { repository, runId, agentName: "shopify_ops_agent", correlationId },
        reader,
      );
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    summarize: () => "Daily Melato audit completed.",
  });
}
