export type WorkflowActionPin = {
  workflow: string;
  action: string;
  ref: string;
};

export function inspectLockfilePolicy(root?: string): {
  ok: boolean;
  errors: string[];
};

export function inspectWorkflowPins(root?: string): {
  workflows: string[];
  actions: WorkflowActionPin[];
  errors: string[];
};

export function inspectSupplyChain(root?: string): {
  ok: boolean;
  errors: string[];
  workflowCount: number;
  actionCount: number;
};
