import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImprovementStore, classifyTask, evaluateCandidate, goldenCases, initialState, learnCandidate, runCycle } from "../lib/improvement/kernel.mjs";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function store() {
  const root = await mkdtemp(join(tmpdir(), "agents-learning-")); roots.push(root);
  return new ImprovementStore(root);
}
async function label(s: ImprovementStore, n = 3, expectedAgent = "finance_agent") {
  for (let i = 0; i < n; i++) {
    const run = await s.record({ category: "finance", version: "baseline", suggestedAgent: "career_agent", selectedAgent: "career_agent", status: "completed", durationMs: 10, providerCalls: 2 });
    await s.feedback(run.id, expectedAgent);
  }
}

describe("closed-loop routing learning", () => {
  test("only classifies unambiguous known task domains", () => {
    expect(classifyTask("Review my budget")).toBe("finance");
    expect(classifyTask("Review my budget and resume")).toBe("unknown");
    expect(classifyTask("hello person@example.com secret password")).toBe("unknown");
  });
  test("does not treat provider completion as a verified success label", async () => {
    const s = await store();
    await s.record({ category: "finance", version: "baseline", suggestedAgent: "career_agent", selectedAgent: "career_agent", status: "completed", durationMs: 10, providerCalls: 2 });
    expect(learnCandidate(await s.read())).toBeNull();
  });
  test("requires independent corroborated labels, and rejects replayed feedback", async () => {
    const s = await store(); await label(s, 2);
    expect(learnCandidate(await s.read())).toBeNull();
    const state = await s.read();
    await expect(s.feedback(state.runs[0].id, "finance_agent")).rejects.toThrow("already");
    await label(s, 1);
    expect(learnCandidate(await s.read())?.routes.finance).toBe("finance_agent");
  });
  test("failure becomes durable defect and founder feedback becomes regression case", async () => {
    const s = await store();
    const run = await s.record({ category: "finance", version: "baseline", status: "failed", failureCode: "route_invalid", durationMs: 1, providerCalls: 1 });
    expect((await s.read()).defects[0]).toMatchObject({ code: "route_invalid", count: 1 });
    await expect(s.feedback(run.id, "finance_agent")).rejects.toThrow("route");
    await label(s, 1);
    const state = await s.read();
    expect(state.replay).toHaveLength(1);
    expect(state.defects.some(d => d.code === "route_mismatch")).toBe(true);
  });
  test("promotes a measured improvement, persists it across restart, and rolls back", async () => {
    const s = await store(); await label(s);
    expect((await runCycle(s)).decision).toBe("promoted");
    let state = await s.read();
    expect(state.champion.routes.finance).toBe("finance_agent");
    expect(state.ledger[0].evaluation?.regressions).toBe(0);
    expect(state.ledger[0].evaluation?.candidateScore).toBeGreaterThan(state.ledger[0].evaluation!.championScore);
    await s.rollback(); state = await s.read();
    expect(state.champion.routes).toEqual({});
    expect((await runCycle(s)).decision).toBe("paused");
  });
  test("ties keep champion; any per-case regression blocks promotion", () => {
    const base = initialState().champion;
    expect(evaluateCandidate(base, base, []).promote).toBe(false);
    const challenger = { ...base, id: "a".repeat(24), routes: { finance: "career_agent" } };
    const result = evaluateCandidate(challenger, base, []);
    expect(result.promote).toBe(false); expect(result.regressions).toBeGreaterThan(0);
  });
  test("rejects unknown fields, policy changes, unknown agents, and invalid metrics", () => {
    const base = initialState().champion;
    for (const candidate of [{ ...base, approvalRequired: false }, { ...base, routes: { finance: "hacker" } }, { ...base, routes: { unknown: "finance_agent" } }]) {
      expect(evaluateCandidate(candidate, base, []).promote).toBe(false);
    }
    expect(goldenCases.length).toBeGreaterThanOrEqual(20);
  });
  test("candidate that contradicts golden truth is rejected", async () => {
    const s = await store(); await label(s, 3, "visual_qa_agent");
    expect((await runCycle(s)).decision).toBe("rejected");
    expect((await s.read()).champion.routes).toEqual({});
    expect((await runCycle(s)).decision).toBe("already_evaluated");
  });
  test("concurrent writers preserve every attempt and worker lock excludes a second writer", async () => {
    const s = await store();
    await Promise.all(Array.from({ length: 8 }, () => s.record({ category: "unknown", version: "baseline", status: "failed", failureCode: "provider_unavailable", durationMs: 0, providerCalls: 1 })));
    expect((await s.read()).runs).toHaveLength(8);
    expect((await s.read()).defects[0].count).toBe(8);
  });
  test("stores only allowed fields and does not persist raw content or arbitrary error strings", async () => {
    const s = await store();
    await s.record({ category: "finance", version: "baseline", status: "failed", failureCode: "provider_unavailable", durationMs: 0, providerCalls: 1, message: "person@example.com", output: "secret" } as never);
    const text = await readFile(join(s.directory, "state.json"), "utf8");
    expect(text).not.toContain("person@example.com"); expect(text).not.toContain('"output"');
    await expect(s.record({ category: "finance", version: "baseline", status: "failed", failureCode: "secret", durationMs: NaN, providerCalls: 1 } as never)).rejects.toThrow();
  });
  test("corrupt storage fails closed rather than resetting learned history", async () => {
    const s = await store(); await s.record({ category: "unknown", version: "baseline", status: "completed", durationMs: 1, providerCalls: 2 });
    await writeFile(join(s.directory, "state.json"), '{"bad":true}');
    await expect(runCycle(s)).rejects.toThrow();
  });
  test("new feedback against a promoted champion triggers automatic canary rollback", async () => {
    const s = await store(); await label(s); await runCycle(s);
    const champion = (await s.read()).champion;
    const run = await s.record({ category: "finance", version: champion.id, suggestedAgent: "career_agent", selectedAgent: "finance_agent", status: "completed", durationMs: 1, providerCalls: 2 });
    await s.feedback(run.id, "career_agent");
    expect((await runCycle(s)).decision).toBe("rolled_back");
    expect((await s.read()).paused).toBe(true);
  });
});

test("late feedback on an older version rolls back an unsafe rule retained by a newer champion", async () => {
  const s = await store(); await label(s); await runCycle(s);
  const older = (await s.read()).champion;
  const run = await s.record({ category: "finance", version: older.id, suggestedAgent: "career_agent", selectedAgent: "finance_agent", status: "completed", durationMs: 1, providerCalls: 2 });
  for (let i = 0; i < 3; i++) {
    const career = await s.record({ category: "career", version: older.id, suggestedAgent: "finance_agent", selectedAgent: "finance_agent", status: "completed", durationMs: 1, providerCalls: 2 });
    await s.feedback(career.id, "career_agent");
  }
  expect((await runCycle(s)).decision).toBe("promoted");
  await s.feedback(run.id, "career_agent");
  expect((await runCycle(s)).decision).toBe("rolled_back");
  expect((await s.read()).champion.id).toBe("baseline");
});
