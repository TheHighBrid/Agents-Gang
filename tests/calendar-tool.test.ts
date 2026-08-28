import { describe, expect, test, vi } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { createCalendarFocusApproval, runCalendarFocusCreation, runCalendarRead } from "../tools/calendar-tool";

const block = { summary: "Deep work", start: "2026-08-28T13:00:00Z", end: "2026-08-28T14:00:00Z", idempotencyKey: "focus-20260828" };

describe("governed calendar tools", () => {
  test("records read-only calendar access", async () => {
    const repository = createInMemoryExecutionRepository();
    const reader = vi.fn().mockResolvedValue([]);
    await expect(runCalendarRead({ repository, runId: "cal-read", agentName: "career_agent" }, { start: block.start, end: block.end }, reader)).resolves.toEqual({ ok: true, data: [] });
    expect(reader).toHaveBeenCalledOnce();
  });

  test("blocks creation until an exact approved block is supplied", async () => {
    const repository = createInMemoryExecutionRepository(); const writer = vi.fn();
    await expect(runCalendarFocusCreation({ repository, runId: "cal-create", agentName: "career_agent" }, block, writer)).resolves.toMatchObject({ ok: false, error: { code: "approval_required" } });
    expect(writer).not.toHaveBeenCalled();
    const approval = await createCalendarFocusApproval(repository, block, "career_agent");
    await repository.decideApproval({ approvalId: approval.id, status: "approved", result: "Approved focus block" });
    writer.mockResolvedValue({ id: "event-1", summary: block.summary, start: block.start, end: block.end, status: "confirmed", htmlLink: null });
    await expect(runCalendarFocusCreation({ repository, runId: "cal-create-2", agentName: "career_agent", approvalId: approval.id }, block, writer)).resolves.toMatchObject({ ok: true, data: { id: "event-1" } });
    await expect(repository.getApproval(approval.id)).resolves.toMatchObject({ status: "consumed" });
  });

  test("rejects changed event details against an existing approval", async () => {
    const repository = createInMemoryExecutionRepository(); const writer = vi.fn();
    const approval = await createCalendarFocusApproval(repository, block, "career_agent");
    await repository.decideApproval({ approvalId: approval.id, status: "approved", result: "Approved" });
    await expect(runCalendarFocusCreation({ repository, runId: "cal-changed", agentName: "career_agent", approvalId: approval.id }, { ...block, end: "2026-08-28T15:00:00Z" }, writer)).resolves.toMatchObject({ ok: false, error: { code: "approval_required" } });
    expect(writer).not.toHaveBeenCalled();
  });
});
