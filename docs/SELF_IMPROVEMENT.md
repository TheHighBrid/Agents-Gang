# Agents-Gang continuous improvement v0.1

Issue: #116. Status: implemented for review; production enablement pending.

## Delivered behavior

With `SELF_IMPROVEMENT_ENABLED=true`, chat observes its orchestrator and specialist calls, captures failures even before an execution run exists, and stores a compact attempt without prompts, responses, credentials, or exception text. Each attempt has a random ID, champion version, coarse task category, proposed and selected specialist, completion status, classified failure, duration, provider-call count, and timestamp. Successful chat responses include `learningAttemptId` for correlation with the protected feedback API. The existing Supabase tool/execution audit remains authoritative for external effects.

Malformed or unknown-agent routes receive one bounded text-only repair attempt. The repair uses fixed instructions and the original request, never malformed model output as instructions. A recovered schema defect still enters the defect register. Normal chat uses two provider calls; a repaired route uses at most three. There is no repeated tool execution or retry of an external side effect.

The worker learns categorical routing rules from founder-verified outcomes. At least three distinct labeled attempts and 80% agreement are required for a category. It abstains on ambiguous/unknown domains and leaves those requests with the orchestrator. Provider completion is an execution status, not a claim that the answer or routing was correct. Repeated failures are clustered by stable failure code and category. Confirmed route corrections become replay regression cases.

Each challenger is declarative JSON containing only a version ID and category-to-existing-agent mapping. The evaluator cannot accept prompts, permissions, tools, policies, commands, code, or unknown config fields. It compares the challenger and champion on a fixed 27-case golden contract suite plus up to 500 verified replay cases. Promotion requires strictly higher combined routing accuracy, zero per-case regressions, valid config, and evaluation within a 50 ms budget. Ties retain champion. Learned lookup adds zero model calls. Evaluation records include per-case results, dataset hashes, scores and decision.

Promotion atomically changes the champion for future requests. In-flight requests finish using their starting snapshot. Verified live routing regressions cause the worker to restore the previous safe version, or baseline if the previous version retains the offending rule, then pause learning. This includes late feedback on an older in-flight version. Owner rollback also pauses learning. Pause stops learning; `SELF_IMPROVEMENT_ENABLED=false` disables the entire learned routing path.

## What kind of machine learning this is

This is a small supervised categorical maximum-likelihood learner with minimum support and abstention. It learns routing counts from trusted labels; it does not fine-tune a foundation model. Nine coarse English keyword domains are supported initially. The golden suite tests routing contracts using synthetic suggestions, not general task quality, factual accuracy, or a statistically calibrated production benchmark. Three labels are a conservative implementation heuristic, not proof of statistical significance.

Deterministic metrics are sufficient for this first routing contract. There is no LLM judge, neural retraining, automatic code author, novel specialist creation, cross-project adapter, or arbitrary tool-schema optimization in v0.1. Arbitrary source patches require a separate isolated authoring/CI pipeline before enablement. An LLM judge must be calibrated before it can contribute evidence; it will never override deterministic failures. Currency/token billing is not measured because the provider contract does not expose usage. The enforced resource bounds are call count and offline lookup/evaluation latency, not a claim of verified dollar savings or end-to-end task latency improvement.

## Storage and failure behavior

`SELF_IMPROVEMENT_DIR` must be an absolute path on a private persistent **single-host** volume shared by the web app and worker. This implementation adapts the supplied Python/Postgres blueprint to the existing TypeScript/Node app without adding a second service or applying a live database migration. An ephemeral/serverless filesystem or replicas with separate disks is unsupported. Production on those platforms needs an atomic database-backed store first.

Transactions use a directory lock, private file permissions, file fsync, atomic rename, and directory fsync. Concurrent writers retry briefly, then fail closed. Corrupt state is rejected, never silently reinitialized. A process crash while holding `.lock` requires operator recovery: stop both writers, preserve `state.json` and the directory for inspection, verify no process holds the lock, remove only the stale `.lock` directory, then restart. The worker never steals locks based on elapsed time. Back up this volume with the app's operational backups.

Retention is bounded: latest 2,000 attempts, 500 replay cases, 100 decision records, and the last 20 evidence IDs per defect cluster. Older unlabelled attempts cannot receive feedback after eviction; cluster counts survive. This is an operational rolling ledger, not a permanent compliance archive. Only the owner-accessible filesystem is trusted. Hashes identify benchmark versions; they are not signatures against a compromised host.

If learning state cannot be read, chat logs a content-free health event and uses the static orchestrator. A trace-write failure does not turn a successful chat into a failed request. The worker logs content-free decisions and stops after five consecutive storage failures; a supervisor can restart it. No candidate is promoted if state/evaluation is invalid.

## Run and inspect

Verification has no API credentials, network calls, or production state:

```bash
npm run improvement:verify
npm test -- tests/self-improvement.test.ts tests/improvement-chat.test.ts tests/improvement-api.test.ts tests/improvement-worker.test.ts
```

On a supported staging host, configure the web app and worker to share the same persistent directory:

```dotenv
SELF_IMPROVEMENT_ENABLED=true
SELF_IMPROVEMENT_DIR=/var/lib/agents-gang/improvement
```

Run one offline cycle with `npm run improvement:once`, or a continuous worker with `npm run improvement:worker`. The continuous loop checks every 30 seconds, backs off to five minutes on failures, and responds to SIGINT/SIGTERM. It reads only its process environment and deliberately does not load the app's `.env` file. It does not need provider credentials. `deploy/agents-gang-improvement.service` is an uninstalled systemd template with filesystem restrictions and no internet address families. Adapt its user and paths during staging release configuration. Do not put this worker in ChatGPT reminders; it must share the application's durable state.

The existing signed founder session is required for **both** methods on `/api/improvement`. Operators, viewers, unsigned, expired and revoked sessions are rejected. GET returns current champion, the last 50 attempts, defect clusters, and recent decisions with `Cache-Control: no-store`.

POST accepts these JSON actions:

| Action | Body fields | Effect |
|---|---|---|
| `feedback` | `attemptId`, `expectedAgent` | Label a captured classifiable attempt exactly once; unknown/evicted IDs fail. |
| `pause` | none | Stop candidate learning/promotion. |
| `resume` | none | Resume evidence-gated cycles. |
| `rollback` | none | Restore previous champion and pause. Fails if none exists. |

Example feedback body:

```json
{"action":"feedback","attemptId":"<learningAttemptId from actual response>","expectedAgent":"finance_agent"}
```

The endpoint cannot insert arbitrary training attempts, change evaluation data or policy, execute a worker cycle, or install configuration. Only the offline worker evaluates and promotes.

## Source-document decisions and remaining release work

The supplied consolidated PDF is the canonical design: trace, grade, diagnose, propose, evaluate, compare, promote/reject, repeat. `selfimprovingsys.md` and `self-improvement loop sys.txt` supply the detailed runtime, failure taxonomy and champion/challenger design. `selfimprovingsys_261030_071734.txt` supplies the stronger isolation/queue/production roadmap, with visibly incomplete code snippets treated as design material rather than executable source. `Practical Planning System for Achieving Any Goal_.txt` supplies baseline, measurable outcome, review cadence and continue/pivot/stop gates.

This issue deliberately implements the Agents-Gang routing adapter first, as requested by the owner. It does not modify Fidelis, Pedit, Allo or HunterXJob. It retains one existing orchestrator and specialist flow. The optimizer, judge policy, golden suite and approval engine remain outside the mutable harness.

Next release gate: review PR, pass CI, rehearse on a persistent staging host, verify authenticated feedback and worker continuity after restart, then approve production enablement through the repository release process. No service, production configuration, migration, merge or deployment is performed by this change. Following that: replace synthetic routing cases with reviewed real-world holdout cases, add an explicit outcome rubric and provider usage metrics, then introduce sandboxed source-patch authoring behind CI after repeated clean config promotions.
