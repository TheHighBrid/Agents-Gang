import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChat } from "../lib/chat/chat-service";
import { ImprovementStore, runCycle } from "../lib/improvement/kernel.mjs";
import type { AIProvider } from "../lib/ai/contracts";

let root: string;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });
async function setup() { root = await mkdtemp(join(tmpdir(), "learning-chat-")); return new ImprovementStore(root); }
const route = { agent: "career_agent", risk_level: 4, approval_required: true, needed_tools: ["gmail.send"], reason: "test", user_intent: "budget" };
function provider(texts: string[]) {
  let calls = 0;
  const value: AIProvider = { name: "fixture", async generate() { calls++; return { text: texts.shift() ?? "", provider: "fixture", model: "fixture" }; } };
  return { value, calls: () => calls };
}

test("records route failures before an execution repository run can be created", async () => {
  const s = await setup(); const p = provider(["bad", "still bad"]);
  await expect(runChat({ message: "Review my budget", provider: p.value, loadMemory: () => "", improvementStore: s })).rejects.toThrow("malformed");
  expect((await s.read()).runs[0]).toMatchObject({ status: "failed", failureCode: "route_invalid", providerCalls: 2 });
  expect(p.calls()).toBe(2);
});

test("repairs malformed routing once and records the recovered defect", async () => {
  const s = await setup(); const p = provider(["bad", JSON.stringify(route), "Draft budget"]);
  const result = await runChat({ message: "Review my budget", provider: p.value, loadMemory: () => "", improvementStore: s });
  expect(result.output).toBe("Draft budget");
  expect((await s.read()).runs[0]).toMatchObject({ status: "completed", failureCode: "route_invalid", providerCalls: 3 });
});

test("promoted route is used live without changing risk, tools, intent or approvals", async () => {
  const s = await setup();
  for (let i = 0; i < 3; i++) {
    const run = await s.record({ category: "finance", version: "baseline", suggestedAgent: "career_agent", selectedAgent: "career_agent", status: "completed", durationMs: 1, providerCalls: 2 });
    await s.feedback(run.id, "finance_agent");
  }
  await runCycle(s);
  const p = provider([JSON.stringify(route), "Budget response"]);
  const result = await runChat({ message: "Review my budget", provider: p.value, loadMemory: () => "", improvementStore: s });
  expect(result.route).toMatchObject({ ...route, agent: "finance_agent", reason: expect.stringContaining("Verified routing") });
  expect(p.calls()).toBe(2);
  expect((await s.read()).runs.at(-1)).toMatchObject({ selectedAgent: "finance_agent", suggestedAgent: "career_agent" });
});

test("ambiguous task abstains and provider errors are classified without logging content", async () => {
  const s = await setup();
  const p: AIProvider = { name: "fixture", async generate() { throw Object.assign(new Error("sensitive content"), { code: "provider_timeout" }); } };
  await expect(runChat({ message: "My budget and resume", provider: p, loadMemory: () => "", improvementStore: s })).rejects.toThrow();
  expect((await s.read()).runs[0]).toMatchObject({ category: "unknown", failureCode: "provider_timeout", providerCalls: 1 });
  expect(JSON.stringify(await s.read())).not.toContain("sensitive content");
});
