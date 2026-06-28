import { getShopifyProducts } from "../tools/shopify";

export async function runProductPageScan() {
  const products = await getShopifyProducts(50);

  // Next step: send each product node to the Product Page Agent, save the audit,
  // and create approval tasks when scores fall below the configured threshold.
  return products;
}
