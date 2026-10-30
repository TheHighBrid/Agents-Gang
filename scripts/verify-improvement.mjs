#!/usr/bin/env node
// Reproducible offline proof. Fixture labels never enter production storage.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImprovementStore, runCycle, selectAgent } from "../lib/improvement/kernel.mjs";
const directory = await mkdtemp(join(tmpdir(), "agents-improvement-proof-"));
try {
  const store = new ImprovementStore(directory);
  for (let i = 0; i < 3; i++) {
    const run = await store.record({ category: "finance", version: "baseline", suggestedAgent: "career_agent", selectedAgent: "career_agent", status: "completed", durationMs: 1, providerCalls: 2 });
    await store.feedback(run.id, "finance_agent");
  }
  const result = await runCycle(store);
  assert.equal(result.decision, "promoted");
  assert.equal(result.evaluation.regressions, 0);
  const restarted = new ImprovementStore(directory);
  const state = await restarted.read();
  assert.equal(selectAgent(state.champion, "finance", "career_agent"), "finance_agent");
  await restarted.rollback();
  assert.equal((await runCycle(store)).decision, "paused");
  console.log(JSON.stringify({ proof: "offline fixture only", decision: result.decision,
    before: result.evaluation.championScore, after: result.evaluation.candidateScore,
    regressions: 0, restart: "passed", rollback: "passed", goldenHash: result.evaluation.datasetHash }, null, 2));
} finally { await rm(directory, { recursive: true, force: true }); }
