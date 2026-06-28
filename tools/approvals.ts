export type ApprovalRequestInput = {
  agentName: string;
  actionType: string;
  riskLevel: number;
  title: string;
  currentValue?: string;
  proposedValue?: string;
};

export function requiresApproval(riskLevel: number) {
  return riskLevel >= 3;
}
