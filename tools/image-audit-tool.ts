import { defineTool, executeTool, type ToolExecutionContext } from "../lib/execution/tool-execution";
import { auditProductImage, type ImageAuditResult } from "./imageAudit";

export type ProductImageAuditor = (url: string) => Promise<ImageAuditResult>;

function parseImageAuditInput(input: unknown): { url: string } {
  if (!input || typeof input !== "object" || !("url" in input)) {
    throw new Error("url is required");
  }
  const url = (input as { url: unknown }).url;
  if (typeof url !== "string" || url.trim().length === 0) {
    throw new Error("url must be a non-empty string");
  }
  return { url: url.trim() };
}

export function createProductImageAuditTool(auditor: ProductImageAuditor) {
  return defineTool({
    name: "product.image.audit",
    capability: "read" as const,
    riskLevel: 1 as const,
    parseInput: parseImageAuditInput,
    execute: ({ url }: { url: string }) => auditor(url),
  });
}

export function runProductImageAudit(
  context: ToolExecutionContext,
  input: unknown,
  auditor: ProductImageAuditor = (url) => auditProductImage(url),
) {
  return executeTool(context, createProductImageAuditTool(auditor), input);
}
