/** Offline, declarative routing learner. Never executes generated code or tools. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

export const AGENTS = Object.freeze([
  "product_page_agent", "creative_director_agent", "shopify_ops_agent", "visual_qa_agent",
  "concierge_agent", "trend_radar_agent", "finance_agent", "career_agent", "general_life_admin_agent",
]);
const DOMAINS = Object.freeze([
  ["product", "product_page_agent", /\b(product page|product description|size guide|composition|fit guidance)\b/i],
  ["creative", "creative_director_agent", /\b(campaign|art direction|lookbook|brand identity)\b/i],
  ["shopify", "shopify_ops_agent", /\b(inventory|shopify|fulfillment|orders)\b/i],
  ["visual", "visual_qa_agent", /\b(image audit|photo quality|image quality|visual audit)\b/i],
  ["concierge", "concierge_agent", /\b(customer support|customer complaint|return request)\b/i],
  ["trends", "trend_radar_agent", /\b(fashion trends|trend report|trend radar)\b/i],
  ["finance", "finance_agent", /\b(budget|cash flow|expenses|financial forecast)\b/i],
  ["career", "career_agent", /\b(resume|interview|cover letter|job search)\b/i],
  ["general", "general_life_admin_agent", /\b(grocery list|personal errands|household chores)\b/i],
]);
const CATEGORIES = DOMAINS.map(([category]) => category);
const FAILURES = ["route_invalid", "route_unknown_agent", "provider_timeout", "provider_unavailable", "provider_invalid_response", "empty_response", "execution_failed", "route_mismatch"];
const VERSION = /^(baseline|[a-f0-9]{24})$/;
const ID = /^[a-f0-9-]{36}$/;
const LIMIT = 2000;
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function classifyTask(message) {
  const matched = DOMAINS.filter(([, , pattern]) => pattern.test(message));
  return matched.length === 1 ? matched[0][0] : "unknown";
}

// A fixed human-reviewable contract suite, separate from rolling learned labels.
export const goldenCases = Object.freeze(DOMAINS.flatMap(([category, expectedAgent], index) => [
  Object.freeze({ id: `${category}-correct`, category, suggestedAgent: expectedAgent, expectedAgent }),
  Object.freeze({ id: `${category}-misroute-a`, category, suggestedAgent: AGENTS[(index + 1) % AGENTS.length], expectedAgent }),
  Object.freeze({ id: `${category}-misroute-b`, category, suggestedAgent: AGENTS[(index + 2) % AGENTS.length], expectedAgent }),
]));
export const DATASET_HASH = hash(goldenCases);

export function initialState() {
  return { schema: 1, paused: false, champion: { id: "baseline", routes: {} }, previous: null,
    runs: [], replay: [], defects: [], ledger: [] };
}

function validConfig(config) {
  return config && typeof config === "object" && !Array.isArray(config) &&
    Object.keys(config).sort().join(",") === "id,routes" && VERSION.test(config.id) &&
    config.routes && typeof config.routes === "object" && !Array.isArray(config.routes) &&
    Object.entries(config.routes).every(([key, value]) => CATEGORIES.includes(key) && AGENTS.includes(value));
}

export function selectAgent(config, category, suggestedAgent) {
  if (!validConfig(config) || !AGENTS.includes(suggestedAgent)) throw new Error("Invalid routing configuration");
  return Object.hasOwn(config.routes, category) ? config.routes[category] : suggestedAgent;
}

function validCase(item) {
  return item && CATEGORIES.includes(item.category) && AGENTS.includes(item.suggestedAgent) && AGENTS.includes(item.expectedAgent);
}

export function evaluateCandidate(candidate, champion, replay) {
  const start = performance.now();
  const valid = validConfig(candidate) && validConfig(champion) && Array.isArray(replay) && replay.every(validCase);
  if (!valid) return { promote: false, reason: "invalid_config_or_dataset", regressions: 0, candidateScore: 0, championScore: 0, datasetHash: DATASET_HASH };
  const cases = [...goldenCases, ...replay];
  let candidateWins = 0, championWins = 0, regressions = 0;
  const items = cases.map(item => {
    const before = selectAgent(champion, item.category, item.suggestedAgent) === item.expectedAgent;
    const after = selectAgent(candidate, item.category, item.suggestedAgent) === item.expectedAgent;
    championWins += Number(before); candidateWins += Number(after);
    if (before && !after) regressions++;
    return { id: item.id, before, after };
  });
  const evaluationLatencyMs = performance.now() - start;
  const candidateScore = candidateWins / cases.length, championScore = championWins / cases.length;
  const promote = regressions === 0 && candidateScore > championScore && evaluationLatencyMs <= 50;
  return { promote, reason: regressions ? "regression" : candidateScore <= championScore ? "no_improvement" : evaluationLatencyMs > 50 ? "latency_budget" : "improved",
    regressions, candidateScore, championScore, evaluationLatencyMs, additionalProviderCalls: 0,
    datasetHash: DATASET_HASH, replayHash: hash(replay), items };
}

/** Categorical maximum-likelihood learner with minimum support and abstention. */
export function learnCandidate(state) {
  const routes = { ...state.champion.routes };
  for (const category of CATEGORIES) {
    const labeled = state.runs.filter(run => run.category === category && run.expectedAgent);
    if (labeled.length < 3) continue;
    const counts = AGENTS.map(agent => [agent, labeled.filter(run => run.expectedAgent === agent).length]);
    counts.sort((a, b) => b[1] - a[1]);
    const [winner, support] = counts[0];
    if (support >= 3 && support / labeled.length >= 0.8) routes[category] = winner;
  }
  if (JSON.stringify(Object.entries(routes).sort()) === JSON.stringify(Object.entries(state.champion.routes).sort())) return null;
  return { id: hash(routes).slice(0, 24), routes };
}

function defect(state, code, category, runId) {
  let cluster = state.defects.find(d => d.code === code && d.category === category);
  if (!cluster) { cluster = { code, category, count: 0, runIds: [] }; state.defects.push(cluster); }
  cluster.count++; cluster.runIds = [...cluster.runIds.slice(-19), runId];
}

function validateState(state) {
  if (!state || state.schema !== 1 || typeof state.paused !== "boolean" || !validConfig(state.champion) ||
      (state.previous !== null && !validConfig(state.previous)) ||
      !["runs", "replay", "defects", "ledger"].every(key => Array.isArray(state[key])) ||
      !state.replay.every(validCase) || state.runs.length > LIMIT) throw new Error("Improvement storage is invalid");
  for (const run of state.runs) {
    validateRun(run);
    if (!ID.test(run.id) || (run.expectedAgent && !AGENTS.includes(run.expectedAgent))) throw new Error("Invalid stored attempt");
  }
  return state;
}

function validateRun(input) {
  if (!input || ![...CATEGORIES, "unknown"].includes(input.category) || !VERSION.test(input.version) ||
      !["completed", "failed"].includes(input.status) ||
      !Number.isFinite(input.durationMs) || input.durationMs < 0 ||
      !Number.isInteger(input.providerCalls) || input.providerCalls < 0 || input.providerCalls > 3 ||
      (input.suggestedAgent !== undefined && !AGENTS.includes(input.suggestedAgent)) ||
      (input.selectedAgent !== undefined && !AGENTS.includes(input.selectedAgent)) ||
      (input.failureCode !== undefined && !FAILURES.includes(input.failureCode))) throw new Error("Invalid attempt");
}

/** Single-host persistent volume store. Lock + fsync + atomic rename per transaction. */
export class ImprovementStore {
  constructor(directory) {
    if (!directory || !isAbsolute(directory)) throw new Error("Absolute improvement storage directory is required");
    this.directory = directory;
  }
  async read() {
    try {
      const raw = await readFile(join(this.directory, "state.json"), "utf8");
      if (Buffer.byteLength(raw) > 16 * 1024 * 1024) throw new Error("Improvement storage exceeds limit");
      return validateState(JSON.parse(raw));
    } catch (error) {
      if (error.code === "ENOENT") return initialState();
      throw error;
    }
  }
  async transaction(fn) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = join(this.directory, ".lock");
    let acquired = false;
    for (let i = 0; i < 100; i++) {
      try { await mkdir(lock); acquired = true; break; }
      catch (error) { if (error.code !== "EEXIST") throw error; await delay(10); }
    }
    if (!acquired) throw new Error("Improvement storage is busy; inspect worker health");
    const temp = join(this.directory, `.${randomUUID()}.tmp`);
    try {
      const state = await this.read();
      const result = await fn(state);
      validateState(state);
      const file = await open(temp, "wx", 0o600);
      try { await file.writeFile(JSON.stringify(state)); await file.sync(); } finally { await file.close(); }
      await rename(temp, join(this.directory, "state.json"));
      const dir = await open(this.directory, "r");
      try { await dir.sync(); } finally { await dir.close(); }
      return result;
    } finally { await rm(temp, { force: true }); await rm(lock, { recursive: true, force: true }); }
  }
  async record(input) {
    validateRun(input);
    // Whitelist fields. Never serialize a prompt, output, exception, secret, or arbitrary metadata.
    return this.transaction(state => {
      const run = { id: randomUUID(), createdAt: new Date().toISOString(), category: input.category,
        version: input.version, status: input.status, durationMs: input.durationMs, providerCalls: input.providerCalls,
        ...(input.suggestedAgent ? { suggestedAgent: input.suggestedAgent } : {}),
        ...(input.selectedAgent ? { selectedAgent: input.selectedAgent } : {}),
        ...(input.failureCode ? { failureCode: input.failureCode } : {}) };
      state.runs.push(run); state.runs = state.runs.slice(-LIMIT);
      if (run.failureCode) defect(state, run.failureCode, run.category, run.id);
      return run;
    });
  }
  async feedback(id, expectedAgent) {
    if (!ID.test(id) || !AGENTS.includes(expectedAgent)) throw new Error("Invalid feedback");
    return this.transaction(state => {
      const run = state.runs.find(run => run.id === id);
      if (!run) throw new Error("Attempt not found");
      if (run.expectedAgent) throw new Error("Attempt already labeled");
      if (!run.suggestedAgent || !run.selectedAgent || run.category === "unknown") throw new Error("Attempt has no classifiable route");
      run.expectedAgent = expectedAgent;
      state.replay.push({ id: run.id, category: run.category, suggestedAgent: run.suggestedAgent, expectedAgent });
      state.replay = state.replay.slice(-500);
      if (expectedAgent !== run.selectedAgent) defect(state, "route_mismatch", run.category, run.id);
      return { id: run.id, expectedAgent };
    });
  }
  async rollback() {
    return this.transaction(state => rollback(state, "owner_rollback"));
  }
  async setPaused(paused) {
    if (typeof paused !== "boolean") throw new Error("Invalid pause state");
    return this.transaction(state => { state.paused = paused; return { paused }; });
  }
}

function rollback(state, reason, target = state.previous) {
  if (!state.previous) throw new Error("No previous champion");
  const replaced = state.champion.id;
  state.champion = target; state.previous = null; state.paused = true;
  state.ledger.push({ at: new Date().toISOString(), decision: "rolled_back", candidateId: replaced, reason });
  state.ledger = state.ledger.slice(-100);
  return { decision: "rolled_back", championId: state.champion.id };
}

export async function runCycle(store) {
  return store.transaction(state => {
    // Owner-verified live regression in a changed route immediately reverts and pauses learning.
    const failures = state.runs.filter(run => run.expectedAgent && run.suggestedAgent && run.selectedAgent &&
      run.selectedAgent !== run.expectedAgent && run.selectedAgent !== run.suggestedAgent &&
      selectAgent(state.champion, run.category, run.suggestedAgent) === run.selectedAgent);
    if (state.previous && failures.length) {
      const previousIsSafe = failures.every(run => selectAgent(state.previous, run.category, run.suggestedAgent) === run.expectedAgent);
      return rollback(state, "verified_live_regression", previousIsSafe ? state.previous : initialState().champion);
    }
    if (state.paused) return { decision: "paused" };
    const candidate = learnCandidate(state);
    if (!candidate) return { decision: "insufficient_evidence" };
    if (state.ledger.some(entry => entry.candidateId === candidate.id && entry.baseId === state.champion.id &&
      entry.evaluation?.datasetHash === DATASET_HASH && entry.evaluation?.replayHash === hash(state.replay))) return { decision: "already_evaluated" };
    const evaluation = evaluateCandidate(candidate, state.champion, state.replay);
    const decision = evaluation.promote ? "promoted" : "rejected";
    state.ledger.push({ at: new Date().toISOString(), decision, candidateId: candidate.id,
      baseId: state.champion.id, config: candidate, evaluation });
    state.ledger = state.ledger.slice(-100);
    if (evaluation.promote) { state.previous = state.champion; state.champion = candidate; }
    return { decision, candidateId: candidate.id, evaluation };
  });
}
