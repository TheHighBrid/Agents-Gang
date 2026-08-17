import { expect, test } from "@playwright/test";

test.describe("persisted dashboard", () => {
  test("renders runs, routing decisions, and audit events from Supabase", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Today's Melato OS" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agent runs" })).toBeVisible();
    await expect(page.getByText("product_page_agent").first()).toBeVisible();
    await expect(page.getByText("Audit the OVUM product page.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Routing decisions" })).toBeVisible();
    await expect(page.getByText("The request asks for a product-page audit.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByText("agent.run.completed")).toBeVisible();
    await expect(page.getByText("succeeded")).toBeVisible();
  });

  test("loads dashboard data through the application API backed by the Supabase stub", async ({ request }) => {
    const response = await request.get("/api/dashboard");

    expect(response.ok()).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      runs: [{ id: "e2e-run-1", status: "completed" }],
      routingDecisions: [{ id: "e2e-route-1", approvalRequired: false }],
      auditEvents: [{ id: "e2e-audit-1", outcome: "succeeded" }],
    });
  });
});
