export type DeploymentTarget = "development" | "staging" | "production";
export type DeploymentFeature = "core" | "ai" | "shopify" | "gmail" | "calendar" | "web_search" | "inbox_alerts" | "migration";
export type ConfigurationRisk = 1 | 2 | 3 | 4;

export type EnvironmentInventoryEntry = {
  variable: string;
  feature: DeploymentFeature;
  secret: boolean;
  risk: ConfigurationRisk;
  exampleRequired: boolean;
};

export type EnvironmentValidationIssue = {
  feature: DeploymentFeature;
  variable: string;
  code:
    | "required"
    | "placeholder"
    | "weak_secret"
    | "invalid_url"
    | "embedded_credentials"
    | "out_of_range"
    | "invalid_boolean"
    | "invalid_value"
    | "unsupported"
    | "environment_mismatch"
    | "dependency"
    | "invalid_domain";
  message: string;
};

export type EnvironmentValidationResult = {
  ok: boolean;
  environment: string;
  enabledFeatures: string[];
  disabledFeatures: string[];
  errors: EnvironmentValidationIssue[];
};

export const environmentInventory: readonly EnvironmentInventoryEntry[];

export class EnvironmentValidationError extends Error {
  readonly issues: EnvironmentValidationIssue[];
}

export function validateDeploymentEnvironment(
  environment?: Readonly<Record<string, string | undefined>>,
): EnvironmentValidationResult;

export function assertDeploymentEnvironment(
  environment?: Readonly<Record<string, string | undefined>>,
): {
  environment: string;
  enabledFeatures: string[];
  disabledFeatures: string[];
};
