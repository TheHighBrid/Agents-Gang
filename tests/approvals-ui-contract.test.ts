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

  it("uses the protected server list filter and detail endpoints", () => {
    const page = read("app/approvals/page.tsx");
    expect(page).toContain("URLSearchParams");
    expect(page).toContain("parameters.set(\"status\", filter)");
    expect(page).toContain("/api/approvals?");
    expect(page).toContain("method: \"GET\"");
    expect(page).toContain("encodeURIComponent(approvalId)");
    expect(page).toContain("setSelectedApproval");
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

  it("includes responsive detail styling and non-color status treatments", () => {
    const css = read("app/approvals/approvals.css");
    expect(css).toContain(".status-badge.expired");
    expect(css).toContain(".status-badge.consumed");
    expect(css).toContain(".approval-detail");
    expect(css).toContain(".approval-layout");
    expect(css).toContain("@media (max-width: 760px)");
  });
});
