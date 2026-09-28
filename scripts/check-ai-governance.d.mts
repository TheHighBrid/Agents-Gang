export interface GovernancePolicyResult {
  ok: boolean;
  errors: string[];
  instructionFiles: string[];
}

export function inspectGovernancePolicy(root?: string): GovernancePolicyResult;
export function assertGovernancePolicy(root?: string): GovernancePolicyResult;
