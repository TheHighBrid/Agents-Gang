export interface GovernancePolicyResult {
  ok: boolean;
  errors: string[];
  instructionFiles: string[];
  symlinkInstructionFiles: string[];
}

export function inspectGovernancePolicy(root?: string): GovernancePolicyResult;
export function assertGovernancePolicy(root?: string): GovernancePolicyResult;
