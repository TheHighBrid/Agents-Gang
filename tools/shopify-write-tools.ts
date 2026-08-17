import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { defineTool, executeTool } from "../lib/execution/tool-execution";
import { createShopifyProduct, updateShopifyProduct } from "./shopify";

type ProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";

export type ShopifyProductCreateInput = {
  title: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  status?: ProductStatus;
};

export type ShopifyProductUpdateInput = Omit<ShopifyProductCreateInput, "title"> & {
  productId: string;
  title?: string;
};

export type ShopifyProductCreateWriter = (input: ShopifyProductCreateInput) => Promise<unknown>;
export type ShopifyProductUpdateWriter = (input: ShopifyProductUpdateInput) => Promise<unknown>;

function isProductStatus(value: unknown): value is ProductStatus {
  return value === "ACTIVE" || value === "DRAFT" || value === "ARCHIVED";
}

type ShopifyProductMutableFields = Omit<ShopifyProductCreateInput, "title"> & { title?: string };

function parseOptionalFields(input: Record<string, unknown>): ShopifyProductMutableFields {
  const parsed: ShopifyProductMutableFields = {};
  for (const field of ["descriptionHtml", "vendor", "productType"] as const) {
    const value = input[field];
    if (value !== undefined) {
      if (typeof value !== "string") {
        throw new Error(`${field} must be a string`);
      }
      parsed[field] = value;
    }
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== "string")) {
      throw new Error("tags must be an array of strings");
    }
    parsed.tags = input.tags;
  }
  if (input.status !== undefined) {
    if (!isProductStatus(input.status)) {
      throw new Error("status must be ACTIVE, DRAFT, or ARCHIVED");
    }
    parsed.status = input.status;
  }
  return parsed;
}

function parseCreateInput(input: unknown): ShopifyProductCreateInput {
  if (!input || typeof input !== "object") {
    throw new Error("product input is required");
  }
  const record = input as Record<string, unknown>;
  if (typeof record.title !== "string" || !record.title.trim()) {
    throw new Error("title must be a non-empty string");
  }
  return { title: record.title.trim(), ...parseOptionalFields(record) };
}

function parseUpdateInput(input: unknown): ShopifyProductUpdateInput {
  if (!input || typeof input !== "object") {
    throw new Error("product input is required");
  }
  const record = input as Record<string, unknown>;
  if (typeof record.productId !== "string" || !record.productId.trim()) {
    throw new Error("productId must be a non-empty string");
  }
  const { productId } = { productId: record.productId.trim() };
  const parsed = parseOptionalFields(record);
  if (record.title !== undefined) {
    if (typeof record.title !== "string" || !record.title.trim()) {
      throw new Error("title must be a non-empty string when provided");
    }
    parsed.title = record.title.trim();
  }
  if (Object.keys(parsed).length === 0) {
    throw new Error("at least one product field must be provided");
  }
  return { productId, ...parsed };
}

export function createShopifyProductCreateTool(writer: ShopifyProductCreateWriter) {
  return defineTool({
    name: "shopify.product.create",
    capability: "execute" as const,
    riskLevel: 3 as const,
    parseInput: parseCreateInput,
    execute: writer,
  });
}

export function createShopifyProductUpdateTool(writer: ShopifyProductUpdateWriter) {
  return defineTool({
    name: "shopify.product.update",
    capability: "execute" as const,
    riskLevel: 3 as const,
    parseInput: parseUpdateInput,
    getTarget: ({ productId }) => ({ type: "shopify_product", id: productId }),
    execute: writer,
  });
}

export function runShopifyProductCreate(
  context: ToolExecutionContext,
  input: unknown,
  writer: ShopifyProductCreateWriter = createShopifyProduct,
) {
  return executeTool(context, createShopifyProductCreateTool(writer), input);
}

export function runShopifyProductUpdate(
  context: ToolExecutionContext,
  input: unknown,
  writer: ShopifyProductUpdateWriter = updateShopifyProduct,
) {
  return executeTool(context, createShopifyProductUpdateTool(writer), input);
}
