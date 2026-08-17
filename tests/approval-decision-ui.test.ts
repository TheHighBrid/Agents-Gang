import { describe, expect, it } from "vitest";
import {
  decisionConflictMessage,
  decisionConfirmationText,
  isDecisionAllowed,
} from "../lib/approvals/decision-ui";

describe("founder approval decision UI behavior", () => {
  const approval = {
    actionType: "shopify_publish_product",
    target: { type: "product", id: "gid://shopify/Product/123" },
  };

  it("repeats the exact decision, action, and target before approval or rejection", () => {
    expect(decisionConfirmationText(approval, "approved")).toContain("Approve");
    expect(decisionConfirmationText(approval, "rejected")).toContain("Reject");
    for (const text of [
      decisionConfirmationText(approval, "approved"),
      decisionConfirmationText(approval, "rejected"),
    ]) {
      expect(text).toContain("shopify_publish_product");
      expect(text).toContain("product / gid://shopify/Product/123");
    }
  });

  it("only permits decision controls for persisted pending requests", () => {
    expect(isDecisionAllowed("pending")).toBe(true);
    for (const status of ["approved", "rejected", "expired", "consumed"] as const) {
      expect(isDecisionAllowed(status)).toBe(false);
    }
  });

  it("explains every terminal conflict without implying a rejected API mutated state", () => {
    const messages = {
      approved: decisionConflictMessage("approved"),
      rejected: decisionConflictMessage("rejected"),
      expired: decisionConflictMessage("expired"),
      consumed: decisionConflictMessage("consumed"),
    };

    expect(messages.approved).toContain("already approved");
    expect(messages.rejected).toContain("already rejected");
    expect(messages.expired).toContain("expired");
    expect(messages.consumed).toContain("already consumed");
    for (const message of Object.values(messages)) {
      expect(message).toContain("No action was taken");
    }
  });
});
