import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { defineTool, executeTool } from "../lib/execution/tool-execution";
import {
  adjustShopifyInventory,
  createShopifyVariants,
  updateShopifyVariants,
} from "./shopify";

export type ShopifyInventoryAdjustInput = {
  inventoryItemId: string;
  locationId: string;
  delta: number;
  reason: string;
  idempotencyKey: string;
  referenceDocumentUri?: string;
};

export type ShopifyVariantInput = Record<string, unknown>;

export type ShopifyVariantCreateInput = {
  productId: string;
  variants: ShopifyVariantInput[];
};

export type ShopifyVariantUpdateInput = ShopifyVariantCreateInput & {
  allowPartialUpdates?: boolean;
};

export type ShopifyInventoryAdjustWriter = (input: ShopifyInventoryAdjustInput) => Promise<unknown>;
export type ShopifyVariantCreateWriter = (input: ShopifyVariantCreateInput) => Promise<unknown>;
export type ShopifyVariantUpdateWriter = (input: ShopifyVariantUpdateInput) => Promise<unknown>;

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function parseInventoryAdjustInput(input: unknown): ShopifyInventoryAdjustInput {
  if (!input || typeof input !== "object") {
    throw new Error("inventory input is required");
  }
  const record = input as Record<string, unknown>;
  const delta = record.delta;
  if (!Number.isInteger(delta) || typeof delta !== "number" || delta === 0) {
    throw new Error("delta must be a non-zero integer");
  }
  const parsed: ShopifyInventoryAdjustInput = {
    inventoryItemId: requireNonEmptyString(record.inventoryItemId, "inventoryItemId"),
    locationId: requireNonEmptyString(record.locationId, "locationId"),
    delta,
    reason: requireNonEmptyString(record.reason, "reason"),
    idempotencyKey: requireNonEmptyString(record.idempotencyKey, "idempotencyKey"),
  };
  if (record.referenceDocumentUri !== undefined) {
    parsed.referenceDocumentUri = requireNonEmptyString(
      record.referenceDocumentUri,
      "referenceDocumentUri",
    );
  }
  return parsed;
}

function parseVariantFields(input: unknown): { productId: string; variants: ShopifyVariantInput[] } {
  if (!input || typeof input !== "object") {
    throw new Error("variant input is required");
  }
  const record = input as Record<string, unknown>;
  const productId = requireNonEmptyString(record.productId, "productId");
  if (!Array.isArray(record.variants) || record.variants.length === 0) {
    throw new Error("variants must be a non-empty array");
  }
  if (record.variants.some((variant) => !variant || typeof variant !== "object" || Array.isArray(variant))) {
    throw new Error("variants must contain objects");
  }
  return { productId, variants: record.variants as ShopifyVariantInput[] };
}

function parseVariantCreateInput(input: unknown): ShopifyVariantCreateInput {
  return parseVariantFields(input);
}

function parseVariantUpdateInput(input: unknown): ShopifyVariantUpdateInput {
  const parsed = parseVariantFields(input);
  const record = input as Record<string, unknown>;
  if (record.allowPartialUpdates !== undefined && typeof record.allowPartialUpdates !== "boolean") {
    throw new Error("allowPartialUpdates must be a boolean");
  }
  return {
    ...parsed,
    ...(record.allowPartialUpdates === undefined
      ? {}
      : { allowPartialUpdates: record.allowPartialUpdates }),
  };
}

export function createShopifyInventoryAdjustTool(writer: ShopifyInventoryAdjustWriter) {
  return defineTool({
    name: "shopify.inventory.adjust",
    capability: "execute" as const,
    riskLevel: 3 as const,
    parseInput: parseInventoryAdjustInput,
    getTarget: ({ inventoryItemId, locationId }) => ({
      type: "shopify_inventory_level",
      id: `${inventoryItemId}:${locationId}`,
    }),
    execute: writer,
  });
}

export function createShopifyVariantCreateTool(writer: ShopifyVariantCreateWriter) {
  return defineTool({
    name: "shopify.variant.create",
    capability: "execute" as const,
    riskLevel: 3 as const,
    parseInput: parseVariantCreateInput,
    getTarget: ({ productId }) => ({ type: "shopify_product", id: productId }),
    execute: writer,
  });
}

export function createShopifyVariantUpdateTool(writer: ShopifyVariantUpdateWriter) {
  return defineTool({
    name: "shopify.variant.update",
    capability: "execute" as const,
    riskLevel: 3 as const,
    parseInput: parseVariantUpdateInput,
    getTarget: ({ productId }) => ({ type: "shopify_product", id: productId }),
    execute: writer,
  });
}

export function runShopifyInventoryAdjust(
  context: ToolExecutionContext,
  input: unknown,
  writer: ShopifyInventoryAdjustWriter = adjustShopifyInventory,
) {
  return executeTool(context, createShopifyInventoryAdjustTool(writer), input);
}

export function runShopifyVariantCreate(
  context: ToolExecutionContext,
  input: unknown,
  writer: ShopifyVariantCreateWriter = createShopifyVariants,
) {
  return executeTool(context, createShopifyVariantCreateTool(writer), input);
}

export function runShopifyVariantUpdate(
  context: ToolExecutionContext,
  input: unknown,
  writer: ShopifyVariantUpdateWriter = updateShopifyVariants,
) {
  return executeTool(context, createShopifyVariantUpdateTool(writer), input);
}
