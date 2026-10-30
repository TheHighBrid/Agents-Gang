import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImprovementStore } from "../lib/improvement/kernel.mjs";

test("actual worker process consumes persisted evidence with no provider credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "learning-worker-"));
  try {
    const store = new ImprovementStore(directory);
    for (let i = 0; i < 3; i++) {
      const run = await store.record({ category: "finance", version: "baseline", suggestedAgent: "career_agent", selectedAgent: "career_agent", status: "completed", durationMs: 1, providerCalls: 2 });
      await store.feedback(run.id, "finance_agent");
    }
    const run = spawnSync(process.execPath, ["scripts/improvement-worker.mjs", "--once"], {
      encoding: "utf8", timeout: 10_000,
      env: { NODE_ENV: "test", PATH: process.env.PATH, SELF_IMPROVEMENT_ENABLED: "true", SELF_IMPROVEMENT_DIR: directory },
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('"decision":"promoted"');
    expect((await store.read()).champion.routes.finance).toBe("finance_agent");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
