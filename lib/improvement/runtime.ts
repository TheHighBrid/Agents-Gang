import { ImprovementStore } from "./kernel.mjs";

export function createImprovementStore(environment: Readonly<Record<string, string | undefined>>) {
  if (environment.SELF_IMPROVEMENT_ENABLED !== "true") return undefined;
  if (!environment.SELF_IMPROVEMENT_DIR) throw new Error("Persistent improvement storage is required");
  return new ImprovementStore(environment.SELF_IMPROVEMENT_DIR);
}
