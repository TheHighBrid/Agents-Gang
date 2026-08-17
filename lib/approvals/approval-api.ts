import type {
  ApprovalQuery,
  ApprovalRecord,
  ExecutionRepository,
} from "../execution/repository";
import type { ApprovalStatus } from "../execution/approval-engine";

const statuses = new Set<ApprovalStatus>(["pending", "approved", "rejected", "expired", "consumed"]);

export type SafeApproval = Omit<ApprovalRecord, "payloadSummary"> & { summary: string };

export function toSafeApproval(approval: ApprovalRecord): SafeApproval {
  const { payloadSummary, ...safe } = approval;
  return { ...safe, summary: payloadSummary };
}

export function parseApprovalQuery(url: string): ApprovalQuery {
  const parameters = new URL(url).searchParams;
  const status = parameters.get("status");
  if (status && !statuses.has(status as ApprovalStatus)) throw new Error("Status filter is invalid");
  const actionType = parameters.get("actionType")?.trim() || undefined;
  if (actionType && actionType.length > 120) throw new Error("Action filter is too long");
  const limitText = parameters.get("limit");
  const limit = limitText === null ? 25 : Number(limitText);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Limit must be an integer from 1 to 100");
  const requestedFrom = parseDate(parameters.get("from"), "From date");
  const requestedTo = parseDate(parameters.get("to"), "To date");
  if (requestedFrom && requestedTo && requestedFrom > requestedTo) throw new Error("From date must not be after to date");
  const cursor = parameters.get("cursor") || undefined;
  if (cursor && cursor.length > 1_000) throw new Error("Cursor is too long");
  return { status: status as ApprovalStatus | undefined, actionType, requestedFrom, requestedTo, cursor, limit };
}

function parseDate(value: string | null, label: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} is invalid`);
  return date.toISOString();
}

export async function getApprovalListResponse(repository: ExecutionRepository, url?: string): Promise<Response> {
  if (!url) {
    const approvals = await repository.listApprovals();
    return Response.json({ approvals: approvals.map(toSafeApproval) });
  }
  const page = await repository.queryApprovals(parseApprovalQuery(url));
  return Response.json({ approvals: page.approvals.map(toSafeApproval), nextCursor: page.nextCursor ?? null });
}

export async function getApprovalDetailResponse(repository: ExecutionRepository, approvalId: string): Promise<Response> {
  const approval = await repository.getApproval(approvalId);
  return approval
    ? Response.json({ approval: toSafeApproval(approval) })
    : Response.json({ error: "Approval request was not found" }, { status: 404 });
}
