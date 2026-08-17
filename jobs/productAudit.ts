import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { runGovernedJob } from "./governedJob";
import { runShopifyProductRead, type ShopifyProductsReader } from "../tools/shopify-products-tool";
import { runProductImageAudit, type ProductImageAuditor } from "../tools/image-audit-tool";

type ProductRecord = {
  id: string;
  title: string;
  imageUrls: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function unwrapProductCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  if (Array.isArray(value.edges)) return value.edges.map((edge) => isRecord(edge) ? edge.node : undefined).filter(Boolean);
  if (Array.isArray(value.nodes)) return value.nodes;
  return [];
}

function extractProductRecords(raw: unknown): ProductRecord[] {
  const root = isRecord(raw) && "data" in raw ? raw.data : raw;
  const products = isRecord(root) ? unwrapProductCollection(root.products) : [];
  return products.flatMap((value) => {
    if (!isRecord(value) || typeof value.id !== "string") return [];
    const imageCollection = unwrapProductCollection(value.images);
    const imageUrls = imageCollection.flatMap((image) => {
      if (!isRecord(image) || typeof image.url !== "string") return [];
      return [image.url];
    });
    return [{ id: value.id, title: typeof value.title === "string" ? value.title : "Untitled product", imageUrls }];
  });
}

export async function runProductAudit(
  context: ToolExecutionContext,
  reader?: ShopifyProductsReader,
  auditor?: ProductImageAuditor,
) {
  const productRead = await runShopifyProductRead(context, { first: 50 }, reader);
  if (!productRead.ok) {
    throw new Error(productRead.error.message);
  }

  const products = extractProductRecords(productRead.data);
  const auditedProducts = [];
  for (const product of products) {
    const imageAudits = [];
    for (const url of product.imageUrls) {
      imageAudits.push(await runProductImageAudit(context, { url }, auditor));
    }
    auditedProducts.push({ id: product.id, title: product.title, imageAudits });
  }

  return { products: auditedProducts };
}

export function runProductAuditJob(
  repository: ToolExecutionContext["repository"],
  reader?: ShopifyProductsReader,
  auditor?: ProductImageAuditor,
) {
  return runGovernedJob({
    repository,
    agentName: "product_page_agent",
    inputSummary: "Scheduled product catalog and image audit",
    reason: "Review Shopify product metadata and image health",
    neededTools: ["shopify.products.read", "product.image.audit"],
    execute: (context) => runProductAudit(context, reader, auditor),
  });
}
