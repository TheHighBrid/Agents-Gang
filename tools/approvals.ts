import type { RiskLevel } from "../lib/execution/approval-engine";
import type {
  ApprovalRecord,
  CreateApprovalInput,
  ExecutionRepository,
} from "../lib/execution/repository";

export type ApprovalRequestInput = CreateApprovalInput;

export function requiresApproval(riskLevel: number) {
  return riskLevel >= 3;
}

export async function createApprovalRequest(
  repository: ExecutionRepository,
  input: ApprovalRequestInput,
): Promise<ApprovalRecord> {
  if (!requiresApproval(input.riskLevel)) {
    throw new Error("Only risk levels 3 and 4 require approval requests");
  }

  return repository.createApproval({
    ...input,
    riskLevel: input.riskLevel as RiskLevel,
  });
}
