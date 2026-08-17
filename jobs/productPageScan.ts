import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import type { ExecutionRepository } from "../lib/execution/repository";
import { runScheduledJob } from "./scheduledJobRunner";
import { runShopifyProductRead, type ShopifyProductsReader } from "../tools/shopify-products-tool";

export function runProductPageScan(
  context: ToolExecutionContext,
  reader?: ShopifyProductsReader,
) {
  return runShopifyProductRead(context, { first: 50 }, reader);
}

export function runScheduledProductPageScan(
  repository: ExecutionRepository,
  reader?: ShopifyProductsReader,
) {
  return runScheduledJob(repository, {
    idempotencyKey: "scheduled-product-page-scan",
    agentName: "product_page_agent",
    provider: "system",
    model: "governed-tool-runner",
    routeAgent: "product_page_agent",
    riskLevel: 1,
    inputSummary: "Scheduled product-page scan.",
    reason: "The daily schedule requested a governed Shopify product-page scan.",
    neededTools: ["shopify.products.read"],
    execute: async ({ runId, correlationId }) => {
      const result = await runProductPageScan(
        { repository, runId, agentName: "product_page_agent", correlationId },
        reader,
      );
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    summarize: () => "Product-page scan completed.",
  });
}
