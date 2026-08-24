import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("founder approvals UI contract", () => {
  it("renders every persisted approval lifecycle status using safe DTO fields", () => {
    const page = read("app/approvals/page.tsx");
    for (const status of ["pending", "approved", "rejected", "expired", "consumed"]) {
      expect(page).toContain(`\"${status}\"`);
    }
    expect(page).toContain("summary: string");
    expect(page).not.toContain("payloadSummary: string");
  });

  it("uses the protected server list and detail endpoints", () => {
    const page = read("app/approvals/page.tsx");
    expect(page).toContain("URLSearchParams");
    expect(page).toContain("parameters.set(\"status\", filter)");
    expect(page).toContain("/api/approvals?");
    expect(page).toContain("method: \"GET\"");
    expect(page).toContain("encodeURIComponent(approvalId)");
    expect(page).toContain("fetchPersistedApproval");
  });

  it("requires founder sign-in and keeps the short-lived session in memory for protected requests", () => {
    const page = read("app/approvals/page.tsx");
    expect(page).toContain("Founder access secret");
    expect(page).toContain("/api/founder/session");
    expect(page).toContain("Sign in and load approvals");
    expect(page).toContain("Authorization: `Bearer ${sessionToken}`");
    expect(page).not.toContain("Authentication disabled");
    expect(page).not.toContain("localStorage");
    expect(page).not.toContain("sessionStorage");
  });

  it("exposes explicit loading, error, empty, focus, and color-independent status semantics", () => {
    const page = read("app/approvals/page.tsx");
    expect(page).toContain("aria-busy={loading}");
    expect(page).toContain("role=\"alert\"");
    expect(page).toContain("role=\"status\"");
    expect(page).toContain("tabIndex={-1}");
    expect(page).toContain("detailHeadingRef.current?.focus()");
    expect(page).toContain("statusLabels[approval.status]");
    expect(page).toContain("No approval requests match this view");
  });

  it("keeps the protected decision API authoritative for approve and reject outcomes", () => {
    const page = read("app/approvals/page.tsx");
    expect(page).toContain("method: \"PATCH\"");
    expect(page).toContain("response.status === 409");
    expect(page).toContain("decisionConflictMessage(latest.status)");
    expect(page).toContain("decisionSuccessMessage(status)");
    expect(page).toContain("No decision state was assumed because the protected API did not confirm the change");
    expect(page).not.toContain("status: status,");
  });

  it("requires explicit high-impact confirmation and supports keyboard cancellation", () => {
    const page = read("app/approvals/page.tsx");
    expect(page).toContain("decisionConfirmationText(approval, confirming)");
    expect(page).toContain("role=\"alertdialog\"");
    expect(page).toContain("aria-modal=\"true\"");
    expect(page).toContain("event.key === \"Escape\"");
    expect(page).toContain("decisionTriggerRef.current?.focus()");
    expect(page).toContain("Decision controls are unavailable because persisted state is");
  });

  it("includes responsive detail styling and visible decision-state treatments", () => {
    const css = read("app/approvals/approvals.css");
    expect(css).toContain(".status-badge.expired");
    expect(css).toContain(".status-badge.consumed");
    expect(css).toContain(".approval-detail");
    expect(css).toContain(".approval-layout");
    expect(css).toContain(".decision-state.conflict");
    expect(css).toContain(".decision-state.error");
    expect(css).toContain(".terminal-decision-note");
    expect(css).toContain("@media (max-width: 760px)");
  });
});
