const managedTargets = new Set(["staging", "production"]);
const optionalFeatures = ["ai", "shopify", "gmail", "calendar", "web_search", "inbox_alerts"];

export const environmentInventory = Object.freeze([
  { variable: "AGENTS_GANG_ENVIRONMENT", feature: "core", secret: false, risk: 1, exampleRequired: false },
  { variable: "SUPABASE_URL", feature: "core", secret: false, risk: 3, exampleRequired: false },
  { variable: "SUPABASE_SERVICE_ROLE_KEY", feature: "core", secret: true, risk: 4, exampleRequired: true },
  { variable: "FOUNDER_AUTH_SECRET", feature: "core", secret: true, risk: 4, exampleRequired: true },
  { variable: "FOUNDER_REVOKED_SESSION_IDS", feature: "core", secret: false, risk: 3, exampleRequired: false },

  { variable: "AI_ENABLED", feature: "ai", secret: false, risk: 2, exampleRequired: false },
  { variable: "AI_PROVIDER", feature: "ai", secret: false, risk: 2, exampleRequired: false },
  { variable: "ANTHROPIC_API_KEY", feature: "ai", secret: true, risk: 3, exampleRequired: true },
  { variable: "ANTHROPIC_MODEL", feature: "ai", secret: false, risk: 2, exampleRequired: false },

  { variable: "SHOPIFY_ENABLED", feature: "shopify", secret: false, risk: 4, exampleRequired: false },
  { variable: "SHOPIFY_STORE_MODE", feature: "shopify", secret: false, risk: 4, exampleRequired: false },
  { variable: "SHOPIFY_STORE_DOMAIN", feature: "shopify", secret: false, risk: 4, exampleRequired: false },
  { variable: "SHOPIFY_TEST_STORE_DOMAIN", feature: "shopify", secret: false, risk: 3, exampleRequired: false },
  { variable: "SHOPIFY_REQUEST_TIMEOUT_MS", feature: "shopify", secret: false, risk: 2, exampleRequired: false },
  { variable: "SHOPIFY_ADMIN_ACCESS_TOKEN", feature: "shopify", secret: true, risk: 4, exampleRequired: true },

  { variable: "GMAIL_ENABLED", feature: "gmail", secret: false, risk: 4, exampleRequired: false },
  { variable: "GMAIL_ACCESS_TOKEN", feature: "gmail", secret: true, risk: 4, exampleRequired: true },
  { variable: "GMAIL_REQUEST_TIMEOUT_MS", feature: "gmail", secret: false, risk: 2, exampleRequired: false },
  { variable: "GMAIL_SEND_ENABLED", feature: "gmail", secret: false, risk: 4, exampleRequired: false },

  { variable: "CALENDAR_ENABLED", feature: "calendar", secret: false, risk: 3, exampleRequired: false },
  { variable: "GOOGLE_CALENDAR_ACCESS_TOKEN", feature: "calendar", secret: true, risk: 4, exampleRequired: true },
  { variable: "GOOGLE_CALENDAR_ID", feature: "calendar", secret: false, risk: 2, exampleRequired: false },
  { variable: "CALENDAR_REQUEST_TIMEOUT_MS", feature: "calendar", secret: false, risk: 2, exampleRequired: false },

  { variable: "WEB_SEARCH_ENABLED", feature: "web_search", secret: false, risk: 2, exampleRequired: false },
  { variable: "BRAVE_SEARCH_API_KEY", feature: "web_search", secret: true, risk: 2, exampleRequired: true },

  { variable: "INBOX_ALERTS_ENABLED", feature: "inbox_alerts", secret: false, risk: 3, exampleRequired: false },
  { variable: "INBOX_ALERT_WEBHOOK_URL", feature: "inbox_alerts", secret: true, risk: 3, exampleRequired: false },

  { variable: "DATABASE_URL", feature: "migration", secret: true, risk: 4, exampleRequired: true },
]);

export class EnvironmentValidationError extends Error {
  constructor(issues) {
    super(`Deployment environment is invalid (${issues.length} configuration error${issues.length === 1 ? "" : "s"})`);
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

function issue(errors, feature, variable, code, message) {
  errors.push({ feature, variable, code, message });
}

function trimmed(environment, variable) {
  const value = environment[variable];
  return typeof value === "string" ? value.trim() : "";
}

function isPlaceholder(value) {
  return /^(?:your_|replace_|example_)[A-Za-z0-9_.-]+$/i.test(value)
    || /^(?:changeme|change-me|replace-me)$/i.test(value)
    || /^<[^>]+>$/.test(value);
}

function validateSecret(errors, environment, feature, variable, minLength) {
  const value = trimmed(environment, variable);
  if (!value) {
    issue(errors, feature, variable, "required", `${variable} is required when ${feature} is enabled`);
    return;
  }
  if (isPlaceholder(value)) {
    issue(errors, feature, variable, "placeholder", `${variable} must not use a committed placeholder value`);
    return;
  }
  if (value.length < minLength) {
    issue(errors, feature, variable, "weak_secret", `${variable} does not meet the minimum secret length`);
  }
}

function validateUrl(errors, environment, feature, variable, { required = true, protocols = ["https:"] } = {}) {
  const value = trimmed(environment, variable);
  if (!value) {
    if (required) issue(errors, feature, variable, "required", `${variable} is required when ${feature} is enabled`);
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    issue(errors, feature, variable, "invalid_url", `${variable} must be a valid URL`);
    return;
  }
  if (!protocols.includes(url.protocol)) {
    issue(errors, feature, variable, "invalid_url", `${variable} must use an allowed secure URL scheme`);
  }
  if (url.username || url.password) {
    issue(errors, feature, variable, "embedded_credentials", `${variable} must not embed credentials in a non-database URL`);
  }
}

function validateTimeout(errors, environment, feature, variable) {
  const value = trimmed(environment, variable);
  if (!value) return;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1_000 || number > 30_000) {
    issue(errors, feature, variable, "out_of_range", `${variable} must be an integer between 1000 and 30000 milliseconds`);
  }
}

function parseFlag(errors, environment, feature, variable, required) {
  const value = trimmed(environment, variable);
  if (!value) {
    if (required) issue(errors, feature, variable, "required", `${variable} must explicitly be true or false`);
    return false;
  }
  if (value !== "true" && value !== "false") {
    issue(errors, feature, variable, "invalid_boolean", `${variable} must be exactly true or false`);
    return false;
  }
  return value === "true";
}

function validateCore(errors, environment, target) {
  if (!managedTargets.has(target)) return;
  validateUrl(errors, environment, "core", "SUPABASE_URL", { protocols: ["https:"] });
  // The staging dashboard uses the founder-authenticated read bridge, while
  // other governed staging workflows still persist directly through Supabase.
  validateSecret(errors, environment, "core", "SUPABASE_SERVICE_ROLE_KEY", 24);
  validateSecret(errors, environment, "core", "FOUNDER_AUTH_SECRET", 32);

  const revoked = trimmed(environment, "FOUNDER_REVOKED_SESSION_IDS");
  if (revoked) {
    const invalid = revoked.split(",").map((value) => value.trim()).filter(Boolean)
      .some((value) => !/^[A-Za-z0-9._:-]{1,128}$/.test(value));
    if (invalid) {
      issue(errors, "core", "FOUNDER_REVOKED_SESSION_IDS", "invalid_value", "FOUNDER_REVOKED_SESSION_IDS contains an invalid session identifier");
    }
  }
}

function validateAi(errors, environment, enabled) {
  if (!enabled) return;
  const provider = trimmed(environment, "AI_PROVIDER") || "anthropic";
  if (provider !== "anthropic") {
    issue(errors, "ai", "AI_PROVIDER", "unsupported", "AI_PROVIDER must be anthropic for this deployment");
  }
  validateSecret(errors, environment, "ai", "ANTHROPIC_API_KEY", 20);
  const model = trimmed(environment, "ANTHROPIC_MODEL");
  if (model && model.length > 128) {
    issue(errors, "ai", "ANTHROPIC_MODEL", "out_of_range", "ANTHROPIC_MODEL must be 128 characters or fewer");
  }
}

function validateShopify(errors, environment, enabled, target) {
  if (!enabled) return;
  const mode = trimmed(environment, "SHOPIFY_STORE_MODE");
  if (mode !== "test" && mode !== "production") {
    issue(errors, "shopify", "SHOPIFY_STORE_MODE", "invalid_value", "SHOPIFY_STORE_MODE must be test or production");
  } else if (target === "production" && mode !== "production") {
    issue(errors, "shopify", "SHOPIFY_STORE_MODE", "environment_mismatch", "Production deployment requires Shopify production mode when Shopify is enabled");
  } else if (target !== "production" && mode !== "test") {
    issue(errors, "shopify", "SHOPIFY_STORE_MODE", "environment_mismatch", "Non-production deployment requires Shopify test mode when Shopify is enabled");
  }

  const domain = trimmed(environment, "SHOPIFY_STORE_DOMAIN");
  if (!domain) {
    issue(errors, "shopify", "SHOPIFY_STORE_DOMAIN", "required", "SHOPIFY_STORE_DOMAIN is required when shopify is enabled");
  } else if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(domain)) {
    issue(errors, "shopify", "SHOPIFY_STORE_DOMAIN", "invalid_domain", "SHOPIFY_STORE_DOMAIN must be a myshopify.com store domain");
  }

  if (mode === "test") {
    const testDomain = trimmed(environment, "SHOPIFY_TEST_STORE_DOMAIN");
    if (!testDomain) {
      issue(errors, "shopify", "SHOPIFY_TEST_STORE_DOMAIN", "required", "SHOPIFY_TEST_STORE_DOMAIN is required in Shopify test mode");
    } else if (testDomain !== domain) {
      issue(errors, "shopify", "SHOPIFY_TEST_STORE_DOMAIN", "environment_mismatch", "SHOPIFY_TEST_STORE_DOMAIN must match SHOPIFY_STORE_DOMAIN in test mode");
    }
  }

  validateSecret(errors, environment, "shopify", "SHOPIFY_ADMIN_ACCESS_TOKEN", 20);
  validateTimeout(errors, environment, "shopify", "SHOPIFY_REQUEST_TIMEOUT_MS");
}

function validateGmail(errors, environment, enabled, sendEnabled) {
  if (sendEnabled && !enabled) {
    issue(errors, "gmail", "GMAIL_SEND_ENABLED", "dependency", "GMAIL_SEND_ENABLED requires GMAIL_ENABLED=true");
  }
  if (!enabled) return;
  validateSecret(errors, environment, "gmail", "GMAIL_ACCESS_TOKEN", 20);
  validateTimeout(errors, environment, "gmail", "GMAIL_REQUEST_TIMEOUT_MS");
}

function validateCalendar(errors, environment, enabled) {
  if (!enabled) return;
  validateSecret(errors, environment, "calendar", "GOOGLE_CALENDAR_ACCESS_TOKEN", 20);
  validateTimeout(errors, environment, "calendar", "CALENDAR_REQUEST_TIMEOUT_MS");
}

function validateWebSearch(errors, environment, enabled) {
  if (!enabled) return;
  validateSecret(errors, environment, "web_search", "BRAVE_SEARCH_API_KEY", 20);
}

function validateInboxAlerts(errors, environment, enabled) {
  if (!enabled) return;
  validateUrl(errors, environment, "inbox_alerts", "INBOX_ALERT_WEBHOOK_URL", { protocols: ["https:"] });
}

function validateOptionalDatabaseUrl(errors, environment) {
  const value = trimmed(environment, "DATABASE_URL");
  if (!value) return;
  let url;
  try {
    url = new URL(value);
  } catch {
    issue(errors, "migration", "DATABASE_URL", "invalid_url", "DATABASE_URL must be a valid PostgreSQL URL");
    return;
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    issue(errors, "migration", "DATABASE_URL", "invalid_url", "DATABASE_URL must use the postgres or postgresql scheme");
  }
  if (!url.hostname || !url.pathname.replace(/^\//, "") || !url.username) {
    issue(errors, "migration", "DATABASE_URL", "invalid_url", "DATABASE_URL must include host, database, and user");
  }
  if (isPlaceholder(url.username) || isPlaceholder(url.password) || /(?:^|\.)example\.(?:com|net|org)$/i.test(url.hostname)) {
    issue(errors, "migration", "DATABASE_URL", "placeholder", "DATABASE_URL must not use committed placeholder connection values");
  }
}

export function validateDeploymentEnvironment(environment = process.env) {
  const errors = [];
  const target = trimmed(environment, "AGENTS_GANG_ENVIRONMENT") || "development";
  if (!new Set(["development", "staging", "production"]).has(target)) {
    issue(errors, "core", "AGENTS_GANG_ENVIRONMENT", "invalid_value", "AGENTS_GANG_ENVIRONMENT must be development, staging, or production");
  }
  const managed = managedTargets.has(target);

  const flags = {
    ai: parseFlag(errors, environment, "ai", "AI_ENABLED", managed),
    shopify: parseFlag(errors, environment, "shopify", "SHOPIFY_ENABLED", managed),
    gmail: parseFlag(errors, environment, "gmail", "GMAIL_ENABLED", managed),
    calendar: parseFlag(errors, environment, "calendar", "CALENDAR_ENABLED", managed),
    web_search: parseFlag(errors, environment, "web_search", "WEB_SEARCH_ENABLED", managed),
    inbox_alerts: parseFlag(errors, environment, "inbox_alerts", "INBOX_ALERTS_ENABLED", managed),
  };
  const gmailSendEnabled = parseFlag(errors, environment, "gmail", "GMAIL_SEND_ENABLED", managed);

  validateCore(errors, environment, target);
  validateAi(errors, environment, flags.ai);
  validateShopify(errors, environment, flags.shopify, target);
  validateGmail(errors, environment, flags.gmail, gmailSendEnabled);
  validateCalendar(errors, environment, flags.calendar);
  validateWebSearch(errors, environment, flags.web_search);
  validateInboxAlerts(errors, environment, flags.inbox_alerts);
  validateOptionalDatabaseUrl(errors, environment);

  const enabledFeatures = ["core", ...optionalFeatures.filter((feature) => flags[feature])];
  const disabledFeatures = optionalFeatures.filter((feature) => !flags[feature]);

  return {
    ok: errors.length === 0,
    environment: target,
    enabledFeatures,
    disabledFeatures,
    errors,
  };
}

export function assertDeploymentEnvironment(environment = process.env) {
  const result = validateDeploymentEnvironment(environment);
  if (!result.ok) throw new EnvironmentValidationError(result.errors);
  return {
    environment: result.environment,
    enabledFeatures: result.enabledFeatures,
    disabledFeatures: result.disabledFeatures,
  };
}
