import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { defineTool, executeTool } from "../lib/execution/tool-execution";
import { getShopifyCollections, getShopifyProductByHandle } from "./shopify";

export type ShopifyProductByHandleReader = (handle: string) => Promise<unknown>;
export type ShopifyCollectionsReader = (first: number) => Promise<unknown>;

type ShopifyProductByHandleInput = {
  handle: string;
};

type ShopifyCollectionsInput = {
  first: number;
};

function parseProductByHandleInput(input: unknown): ShopifyProductByHandleInput {
  if (!input || typeof input !== "object" || !("handle" in input)) {
    throw new Error("handle is required");
  }
  const handle = (input as { handle: unknown }).handle;
  if (typeof handle !== "string" || !handle.trim()) {
    throw new Error("handle must be a non-empty string");
  }
  return { handle: handle.trim() };
}

function parseCollectionsInput(input: unknown): ShopifyCollectionsInput {
  if (!input || typeof input !== "object" || !("first" in input)) {
    throw new Error("first is required");
  }
  const first = (input as { first: unknown }).first;
  if (!Number.isInteger(first) || typeof first !== "number" || first < 1 || first > 250) {
    throw new Error("first must be an integer from 1 to 250");
  }
  return { first };
}

export function createShopifyProductByHandleReadTool(reader: ShopifyProductByHandleReader) {
  return defineTool({
    name: "shopify.product.read",
    capability: "read" as const,
    riskLevel: 1 as const,
    parseInput: parseProductByHandleInput,
    execute: ({ handle }: ShopifyProductByHandleInput) => reader(handle),
  });
}

export function createShopifyCollectionsReadTool(reader: ShopifyCollectionsReader) {
  return defineTool({
    name: "shopify.collections.read",
    capability: "read" as const,
    riskLevel: 1 as const,
    parseInput: parseCollectionsInput,
    execute: ({ first }: ShopifyCollectionsInput) => reader(first),
  });
}

export function runShopifyProductByHandleRead(
  context: ToolExecutionContext,
  input: unknown,
  reader: ShopifyProductByHandleReader = getShopifyProductByHandle,
) {
  return executeTool(context, createShopifyProductByHandleReadTool(reader), input);
}

export function runShopifyCollectionsRead(
  context: ToolExecutionContext,
  input: unknown,
  reader: ShopifyCollectionsReader = getShopifyCollections,
) {
  return executeTool(context, createShopifyCollectionsReadTool(reader), input);
}
