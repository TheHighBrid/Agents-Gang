#!/usr/bin/env node
import { setTimeout as delay } from "node:timers/promises";
import { ImprovementStore, runCycle } from "../lib/improvement/kernel.mjs";

if (process.env.SELF_IMPROVEMENT_ENABLED !== "true") {
  console.error("SELF_IMPROVEMENT_ENABLED=true is required"); process.exitCode = 1;
} else {
  const store = new ImprovementStore(process.env.SELF_IMPROVEMENT_DIR);
  const once = process.argv.includes("--once");
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  let failures = 0;
  do {
    try {
      const result = await runCycle(store);
      console.info(JSON.stringify({ event: "improvement.cycle", decision: result.decision, candidateId: result.candidateId }));
      failures = 0;
    } catch {
      failures++;
      console.error(JSON.stringify({ event: "improvement.cycle.failed", failures }));
      if (once || failures >= 5) { process.exitCode = 1; break; }
    }
    if (once || controller.signal.aborted) break;
    try { await delay(Math.min(300_000, 30_000 * 2 ** failures), undefined, { signal: controller.signal }); }
    catch { break; }
  } while (!controller.signal.aborted);
}
