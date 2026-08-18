export const migrationBaselines: readonly string[];

export function buildFreshBundle(root?: string): string;
export function buildUpgradeBundle(root: string | undefined, baseline: string): string;
export function buildVerificationBundle(root?: string): string;

export function buildPsqlConnectionEnvironment(
  databaseUrl: string,
  baseEnvironment?: NodeJS.ProcessEnv,
): {
  env: NodeJS.ProcessEnv & {
    PGHOST: string;
    PGPORT: string;
    PGDATABASE: string;
    PGUSER: string;
    PGPASSWORD: string;
    PGSSLMODE: string;
  };
  args: string[];
};

export function applySql(
  sql: string,
  options?: {
    environment?: NodeJS.ProcessEnv;
    command?: string;
  },
): void;
