export type FounderSessionIssuerOptions = {
  secret: string;
  subject?: string;
  ttlSeconds?: number;
  now?: number;
  sessionId?: string;
};

export type FounderSessionCliArgs =
  | { subject: string; ttlSeconds: number }
  | { help: true };

export function issueFounderSession(options: FounderSessionIssuerOptions): string;
export function parseFounderSessionArgs(args: string[]): FounderSessionCliArgs;
