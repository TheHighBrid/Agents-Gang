# Agents-Gang Delivery Calendar

| Sequence | Deliverable | Exit evidence |
|---:|---|---|
| 1 | Governed execution foundation | Repository contracts, approval lifecycle, persisted dashboard, and passing unit tests. |
| 2 | Scheduled automation fabric | Four scheduled jobs, governed adapters, idempotency keys, durable leases, and audit events. |
| 3 | Shopify production boundary | Injected test-store client, normalized rate-limit/auth/network/GraphQL/malformed errors, safe read transport tests, and mutation-disabled default. |
| 4 | Observability and recovery (**current**) | Correlation IDs, payload-safe metrics, alert thresholds, and runbook updates. |
| 5 | Protected operator controls | Authenticated manual trigger/retry API with race-safe duplicate handling. |
| 6 | Deployment readiness | Environment contract, CI/CD, staging soak, deployment runbook, and go/no-go evidence. |

The current branch has finished the Shopify boundary and should next establish observability before beginning protected operator controls. Each delivery step must preserve the common execution contract and must not introduce real production credentials or uncontrolled external mutations into CI.
