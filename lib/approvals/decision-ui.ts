export type ApprovalLifecycleStatus = "pending" | "approved" | "rejected" | "expired" | "consumed";
export type ApprovalDecisionStatus = Extract<ApprovalLifecycleStatus, "approved" | "rejected">;

export function decisionConfirmationText(
  input: { actionType: string; target: { type: string; id: string } },
  decision: ApprovalDecisionStatus,
): string {
  const verb = decision === "approved" ? "Approve" : "Reject";
  return `${verb} ${input.actionType} on ${input.target.type} / ${input.target.id}`;
}

export function isDecisionAllowed(status: ApprovalLifecycleStatus): boolean {
  return status === "pending";
}

export function decisionConflictMessage(status: ApprovalLifecycleStatus): string {
  switch (status) {
    case "approved":
      return "No action was taken. This request was already approved in persisted state.";
    case "rejected":
      return "No action was taken. This request was already rejected in persisted state.";
    case "expired":
      return "No action was taken. This request expired before the decision could be saved.";
    case "consumed":
      return "No action was taken. This approval was already consumed by governed execution.";
    case "pending":
      return "No action was taken. The request changed before the decision could be saved. Review the latest persisted state and try again only if it is still pending.";
  }
}

export function decisionSuccessMessage(decision: ApprovalDecisionStatus): string {
  return decision === "approved"
    ? "Approval saved by the protected server and persisted as approved."
    : "Rejection saved by the protected server and persisted as rejected.";
}
