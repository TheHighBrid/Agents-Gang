import { createHash } from "node:crypto";
import { createApprovalRequest } from "./approvals";
import { createFocusBlock, listCalendarEvents, prepareFocusBlock, type CalendarEvent, type FocusBlockInput } from "./calendar";
import { defineTool, executeTool, type ToolExecutionContext } from "../lib/execution/tool-execution";
import type { ExecutionRepository } from "../lib/execution/repository";

export const calendarEventTarget = (input: FocusBlockInput) => createHash("sha256").update(JSON.stringify(prepareFocusBlock(input))).digest("hex");

export function createCalendarReadTool(reader: (input: { start: string; end: string }) => Promise<CalendarEvent[]> = ({ start, end }) => listCalendarEvents(start, end)) {
  return defineTool({ name: "calendar.events.read", capability: "read" as const, riskLevel: 1 as const,
    parseInput(input: unknown) { const value = input as { start?: unknown; end?: unknown }; if (typeof value?.start !== "string" || typeof value?.end !== "string") throw new Error("start and end are required"); return { start: value.start, end: value.end }; }, execute: reader });
}

export function runCalendarRead(context: ToolExecutionContext, input: unknown, reader?: (input: { start: string; end: string }) => Promise<CalendarEvent[]>) {
  return executeTool(context, createCalendarReadTool(reader), input);
}

export function createCalendarFocusTool(writer: (input: FocusBlockInput) => Promise<CalendarEvent> = (input) => createFocusBlock(input)) {
  return defineTool({ name: "calendar.focus.create", capability: "execute" as const, riskLevel: 3 as const, parseInput: (input: unknown) => prepareFocusBlock(input as FocusBlockInput),
    getTarget: (input) => ({ type: "calendar_event", id: calendarEventTarget(input) }), execute: writer });
}

export function runCalendarFocusCreation(context: ToolExecutionContext, input: unknown, writer?: (input: FocusBlockInput) => Promise<CalendarEvent>) {
  return executeTool(context, createCalendarFocusTool(writer), input);
}

export async function createCalendarFocusApproval(repository: ExecutionRepository, input: FocusBlockInput, requestingAgent: string) {
  const block = prepareFocusBlock(input);
  return createApprovalRequest(repository, { requestingAgent, actionType: "calendar.focus.create", target: { type: "calendar_event", id: calendarEventTarget(block) }, riskLevel: 3,
    payloadSummary: `Create calendar focus block “${block.summary}” from ${block.start} to ${block.end}.` });
}
