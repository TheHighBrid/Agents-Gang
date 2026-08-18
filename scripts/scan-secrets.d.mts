export type SecretFinding = {
  path: string;
  rule: string;
  line: number;
};

export function scanContentForSecrets(path: string, content: string): SecretFinding[];
export function scanTrackedFiles(root?: string): SecretFinding[];
