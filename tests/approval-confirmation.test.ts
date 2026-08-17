import { describe, expect, test } from "vitest";
import { approvalConfirmationText, requiresExplicitApprovalConfirmation } from "../lib/approvals/decision";

describe("approval confirmation policy", () => {
  test("requires confirmation for risk level 3 and 4 decisions", () => {
    expect(requiresExplicitApprovalConfirmation(2)).toBe(false);
    expect(requiresExplicitApprovalConfirmation(3)).toBe(true);
    expect(requiresExplicitApprovalConfirmation(4)).toBe(true);
  });

  test("repeats the action and target in the confirmation copy", () => {
    expect(approvalConfirmationText({
      actionType: "shopify.product.publish",
      target: { type: "shopify_product", id: "gid://shopify/Product/123" },
    })).toBe("Confirm approval: shopify.product.publish on shopify_product / gid://shopify/Product/123");
  });
});
