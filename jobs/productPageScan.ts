import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { runShopifyProductRead, type ShopifyProductsReader } from "../tools/shopify-products-tool";

export function runProductPageScan(
  context: ToolExecutionContext,
  reader?: ShopifyProductsReader,
) {
  return runShopifyProductRead(context, { first: 50 }, reader);
}
