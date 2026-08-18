import { assertDeploymentEnvironment } from "./lib/config/environment.mjs";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const target = process.env.AGENTS_GANG_ENVIRONMENT ?? "development";
  if (target === "staging" || target === "production") {
    assertDeploymentEnvironment(process.env);
  }
}
