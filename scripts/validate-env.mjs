#!/usr/bin/env node

import {
  validateDeploymentEnvironment,
} from "../lib/config/environment.mjs";

const result = validateDeploymentEnvironment(process.env);

if (!result.ok) {
  console.error(`Environment validation failed for ${result.environment}.`);
  for (const error of result.errors) {
    console.error(`[${error.feature}] ${error.variable} (${error.code}): ${error.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Environment validation passed for ${result.environment}.`);
  console.log(`Enabled features: ${result.enabledFeatures.join(", ")}.`);
  console.log(`Disabled optional features: ${result.disabledFeatures.join(", ") || "none"}.`);
}
