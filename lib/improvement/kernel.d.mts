export type Category = "product" | "creative" | "shopify" | "visual" | "concierge" | "trends" | "finance" | "career" | "general" | "unknown";
export type Harness = { id: string; routes: Partial<Record<Category, string>> };
export type AttemptInput = { category: Category; version: string; suggestedAgent?: string; selectedAgent?: string; status: "completed" | "failed"; failureCode?: string; durationMs: number; providerCalls: number };
export type Attempt = AttemptInput & { id: string; createdAt: string; expectedAgent?: string };
export type ReplayCase = { id: string; category: Category; suggestedAgent: string; expectedAgent: string };
export type Evaluation = { promote: boolean; reason: string; regressions: number; candidateScore: number; championScore: number; datasetHash: string; evaluationLatencyMs?: number; additionalProviderCalls?: number; replayHash?: string; items?: { id: string; before: boolean; after: boolean }[] };
export type LedgerEntry = { at: string; decision: string; candidateId: string; baseId?: string; config?: Harness; evaluation?: Evaluation; reason?: string };
export type ImprovementState = { schema: number; paused: boolean; champion: Harness; previous: Harness | null; runs: Attempt[]; replay: ReplayCase[]; defects: { code: string; category: Category; count: number; runIds: string[] }[]; ledger: LedgerEntry[] };
export const AGENTS: readonly string[];
export const DATASET_HASH: string;
export const goldenCases: readonly ReplayCase[];
export function classifyTask(message: string): Category;
export function initialState(): ImprovementState;
export function selectAgent(config: Harness, category: Category, suggestedAgent: string): string;
export function evaluateCandidate(candidate: Harness, champion: Harness, replay: ReplayCase[]): Evaluation;
export function learnCandidate(state: ImprovementState): Harness | null;
export class ImprovementStore {
  readonly directory: string;
  constructor(directory: string);
  read(): Promise<ImprovementState>;
  transaction<T>(fn: (state: ImprovementState) => T | Promise<T>): Promise<T>;
  record(input: AttemptInput): Promise<Attempt>;
  feedback(id: string, expectedAgent: string): Promise<{ id: string; expectedAgent: string }>;
  rollback(): Promise<{ decision: string; championId: string }>;
  setPaused(paused: boolean): Promise<{ paused: boolean }>;
}
export function runCycle(store: ImprovementStore): Promise<{ decision: string; candidateId?: string; championId?: string; evaluation?: Evaluation }>;
