export type ReleaseManifestOptions = {
  candidateSha?: string;
  eventName?: string;
  refName?: string;
  runId?: string;
  generatedAt?: string;
};

export type ReleaseManifest = {
  schemaVersion: 1;
  candidateSha: string;
  generatedAt: string;
  eventName: string;
  refName: string;
  workflowRunId: string;
  releaseEligible: boolean;
  requiredGates: string[];
  runtime: {
    node: string;
    platform: string;
    architecture: string;
  };
  files: Record<string, string>;
};

export function createReleaseManifest(root?: string, options?: ReleaseManifestOptions): ReleaseManifest;
