import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { runGovernedJob } from "./governedJob";
import { runShopifyProductRead, type ShopifyProductsReader } from "../tools/shopify-products-tool";

export function runProductPageScan(
  context: ToolExecutionContext,
  reader?: ShopifyProductsReader,
) {
  return runShopifyProductRead(context, { first: 50 }, reader);
}

export function runProductPageScanJob(
  repository: ToolExecutionContext["repository"],
  reader?: ShopifyProductsReader,
) {
  return runGovernedJob({
    repository,
    agentName: "product_page_agent",
    inputSummary: "Scheduled product-page scan",
    reason: "Scheduled product-page audit",
    neededTools: ["shopify.products.read"],
    execute: (context) => runProductPageScan(context, reader),
  });
}
