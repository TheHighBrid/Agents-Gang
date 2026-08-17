import type {
  ApprovalRecord,
  CreateApprovalInput,
  CreateAgentRunInput,
  ExecutionRepository,
  AgentRunRecord,
} from "../lib/execution/repository";

export async function saveAgentRun(
  repository: ExecutionRepository,
  input: CreateAgentRunInput,
): Promise<AgentRunRecord> {
  return repository.createAgentRun(input);
}

export async function saveApprovalRequest(
  repository: ExecutionRepository,
  input: CreateApprovalInput,
): Promise<ApprovalRecord> {
  return repository.createApproval(input);
}

export async function getBrandMemory() {
  throw new Error("Database-backed memory is not implemented yet");
}

export async function getProductAuditHistory() {
  throw new Error("Product audit history is not implemented yet");
}
