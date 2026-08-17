export type RiskLevel = 1 | 2 | 3 | 4;

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "consumed";

export type ApprovalReference = {
  status: ApprovalStatus;
  expiresAt?: string;
};

export type ApprovalGateResult =
  | { allowed: true }
  | {
    allowed: false;
    reason: "approval_required" | "approval_not_approved" | "approval_expired";
  };

export function isApprovalExpired(expiresAt: string | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime();
}

export function evaluateApprovalGate({
  riskLevel,
  approval,
  now = new Date(),
}: {
  riskLevel: RiskLevel;
  approval?: ApprovalReference;
  now?: Date;
}): ApprovalGateResult {
  if (!Number.isInteger(riskLevel) || riskLevel < 1 || riskLevel > 4) {
    throw new Error("Risk level must be an integer from 1 to 4");
  }

  if (riskLevel < 3) {
    return { allowed: true };
  }

  if (!approval) {
    return { allowed: false, reason: "approval_required" };
  }

  if (approval.status !== "approved") {
    return { allowed: false, reason: "approval_not_approved" };
  }

  if (isApprovalExpired(approval.expiresAt, now)) {
    return { allowed: false, reason: "approval_expired" };
  }

  return { allowed: true };
}
