import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { defineTool, executeTool } from "../lib/execution/tool-execution";
import { getShopifyProducts } from "./shopify";

export type ShopifyProductsReader = (first: number) => Promise<unknown>;

type ShopifyProductReadInput = {
  first: number;
};

function parseProductReadInput(input: unknown): ShopifyProductReadInput {
  if (!input || typeof input !== "object" || !("first" in input)) {
    throw new Error("first is required");
  }

  const first = (input as { first: unknown }).first;
  if (!Number.isInteger(first) || typeof first !== "number" || first < 1 || first > 250) {
    throw new Error("first must be an integer from 1 to 250");
  }

  return { first };
}

export function createShopifyProductReadTool(reader: ShopifyProductsReader) {
  return defineTool({
    name: "shopify.products.read",
    capability: "read" as const,
    riskLevel: 1 as const,
    parseInput: parseProductReadInput,
    execute: ({ first }: ShopifyProductReadInput) => reader(first),
  });
}

export function runShopifyProductRead(
  context: ToolExecutionContext,
  input: unknown,
  reader: ShopifyProductsReader = getShopifyProducts,
) {
  return executeTool(context, createShopifyProductReadTool(reader), input);
}
