import type { ToolExecutionContext } from "../lib/execution/tool-execution";
import { defineTool, executeTool } from "../lib/execution/tool-execution";
import {
  createShopifyCustomer,
  getShopifyCustomers,
  updateShopifyCustomer,
} from "./shopify";

export type ShopifyCustomerReadInput = {
  first: number;
  query?: string;
};

export type ShopifyCustomerFields = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  tags?: string[];
  taxExempt?: boolean;
};

export type ShopifyCustomerCreateInput = ShopifyCustomerFields;
export type ShopifyCustomerUpdateInput = ShopifyCustomerFields & { customerId: string };

export type ShopifyCustomerReader = (input: ShopifyCustomerReadInput) => Promise<unknown>;
export type ShopifyCustomerCreateWriter = (input: ShopifyCustomerCreateInput) => Promise<unknown>;
export type ShopifyCustomerUpdateWriter = (input: ShopifyCustomerUpdateInput) => Promise<unknown>;

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function parseCustomerFields(input: Record<string, unknown>): ShopifyCustomerFields {
  const parsed: ShopifyCustomerFields = {};
  for (const field of ["email", "phone", "firstName", "lastName"] as const) {
    if (input[field] !== undefined) {
      parsed[field] = requireNonEmptyString(input[field], field);
    }
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== "string")) {
      throw new Error("tags must be an array of strings");
    }
    parsed.tags = input.tags;
  }
  if (input.taxExempt !== undefined) {
    if (typeof input.taxExempt !== "boolean") {
      throw new Error("taxExempt must be a boolean");
    }
    parsed.taxExempt = input.taxExempt;
  }
  return parsed;
}

function parseCustomerReadInput(input: unknown): ShopifyCustomerReadInput {
  if (!input || typeof input !== "object") {
    throw new Error("customer read input is required");
  }
  const record = input as Record<string, unknown>;
  const first = record.first;
  if (!Number.isInteger(first) || typeof first !== "number" || first < 1 || first > 250) {
    throw new Error("first must be an integer from 1 to 250");
  }
  const parsed: ShopifyCustomerReadInput = { first };
  if (record.query !== undefined) {
    parsed.query = requireNonEmptyString(record.query, "query");
  }
  return parsed;
}

function parseCustomerCreateInput(input: unknown): ShopifyCustomerCreateInput {
  if (!input || typeof input !== "object") {
    throw new Error("customer input is required");
  }
  const parsed = parseCustomerFields(input as Record<string, unknown>);
  if (!parsed.email && !parsed.phone && !parsed.firstName && !parsed.lastName) {
    throw new Error("at least one customer identifying field is required");
  }
  return parsed;
}

function parseCustomerUpdateInput(input: unknown): ShopifyCustomerUpdateInput {
  if (!input || typeof input !== "object") {
    throw new Error("customer input is required");
  }
  const record = input as Record<string, unknown>;
  const customerId = requireNonEmptyString(record.customerId, "customerId");
  const fields = parseCustomerFields(record);
  if (Object.keys(fields).length === 0) {
    throw new Error("at least one customer field must be provided");
  }
  return { customerId, ...fields };
}

export function createShopifyCustomerReadTool(reader: ShopifyCustomerReader) {
  return defineTool({
    name: "shopify.customers.read",
    capability: "read" as const,
    riskLevel: 1 as const,
    parseInput: parseCustomerReadInput,
    execute: reader,
  });
}

export function createShopifyCustomerCreateTool(writer: ShopifyCustomerCreateWriter) {
  return defineTool({
    name: "shopify.customer.create",
    capability: "execute" as const,
    riskLevel: 3 as const,
    parseInput: parseCustomerCreateInput,
    execute: writer,
  });
}

export function createShopifyCustomerUpdateTool(writer: ShopifyCustomerUpdateWriter) {
  return defineTool({
    name: "shopify.customer.update",
    capability: "execute" as const,
    riskLevel: 3 as const,
    parseInput: parseCustomerUpdateInput,
    getTarget: ({ customerId }) => ({ type: "shopify_customer", id: customerId }),
    execute: writer,
  });
}

export function runShopifyCustomerRead(
  context: ToolExecutionContext,
  input: unknown,
  reader: ShopifyCustomerReader = getShopifyCustomers,
) {
  return executeTool(context, createShopifyCustomerReadTool(reader), input);
}

export function runShopifyCustomerCreate(
  context: ToolExecutionContext,
  input: unknown,
  writer: ShopifyCustomerCreateWriter = createShopifyCustomer,
) {
  return executeTool(context, createShopifyCustomerCreateTool(writer), input);
}

export function runShopifyCustomerUpdate(
  context: ToolExecutionContext,
  input: unknown,
  writer: ShopifyCustomerUpdateWriter = updateShopifyCustomer,
) {
  return executeTool(context, createShopifyCustomerUpdateTool(writer), input);
}
