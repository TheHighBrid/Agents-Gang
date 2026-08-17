export function requiresExplicitApprovalConfirmation(riskLevel: number): boolean {
  return riskLevel >= 3;
}

export function approvalConfirmationText(input: {
  actionType: string;
  target: { type: string; id: string };
}): string {
  return `Confirm approval: ${input.actionType} on ${input.target.type} / ${input.target.id}`;
}
