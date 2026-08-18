import { runDailyMelatoAudit } from "../../jobs/dailyMelatoAudit";
import type { ManualJobDefinition } from "./manual-job-controls";

export const MANUAL_JOB_DEFINITIONS: readonly ManualJobDefinition[] = Object.freeze([
  {
    name: "job.daily_melato_audit",
    agentName: "shopify_ops_agent",
    inputSummary: "Manual daily Melato store health audit",
    reason: "Authorized operator requested the approved daily store-health workflow",
    neededTools: ["shopify.products.read", "product.image.audit"],
    maxAttempts: 3,
    leaseSeconds: 300,
    retryDelayMs: 1_000,
    execute: async (context) => runDailyMelatoAudit(context),
  },
]);

export const MANUAL_JOB_NAMES = MANUAL_JOB_DEFINITIONS.map((job) => job.name);
