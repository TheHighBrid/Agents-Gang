"use client";

import { FormEvent, useState } from "react";

type RunStatus = "running" | "completed" | "failed" | "blocked";
type Outcome = "blocked" | "succeeded" | "failed";
type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "consumed";
type DashboardView = "attention" | "all";
type ScheduledJobStatus = "running" | "retry_scheduled" | "completed" | "failed";
type JobAction = "none" | "wait_for_completion" | "wait_for_retry" | "inspect_failure";
type AlertSeverity = "warning" | "critical";

type DashboardRun = {
  id: string;
  agentName: string;
  status: RunStatus;
  riskLevel: number;
  createdAt: string;
  completedAt?: string;
  errorCode?: string;
  durationMs?: number;
  correlationId?: string;
};

type DashboardRoutingDecision = {
  id: string;
  runId: string;
  selectedAgent: string;
  riskLevel: number;
  reason: string;
  neededTools: string[];
  approvalRequired: boolean;
  createdAt: string;
};

type DashboardToolCall = {
  id: string;
  runId: string;
  agentName: string;
  toolName: string;
  capability: "read" | "draft" | "prepare" | "execute";
  riskLevel: number;
  approvalId?: string;
  outcome: Outcome;
  errorCode?: string;
  createdAt: string;
};

type DashboardAuditEvent = {
  id: string;
  runId?: string;
  agentName?: string;
  toolName?: string;
  riskLevel?: number;
  approvalId?: string;
  eventType: string;
  outcome: Outcome;
  createdAt: string;
};

type DashboardApproval = {
  id: string;
  requestingAgent: string;
  actionType: string;
  target: { type: string; id: string };
  riskLevel: number;
  status: ApprovalStatus;
  requestedAt: string;
  updatedAt: string;
  decidedAt?: string;
  expiresAt?: string;
};

type DashboardScheduledJob = {
  id: string;
  jobName: string;
  status: ScheduledJobStatus;
  attemptCount: number;
  maxAttempts: number;
  retryable: boolean;
  lastErrorCode?: string;
  nextRetryAt?: string;
  updatedAt: string;
  completedAt?: string;
  correlationId?: string;
  recommendedAction: JobAction;
};

type OperationalAlert = {
  code: string;
  severity: AlertSeverity;
  count: number;
  threshold: number;
  owner: string;
  nextAction: string;
};

type OperationalHealth = {
  windowMinutes: number;
  metrics: {
    failedJobs: number;
    providerTimeouts: number;
    persistenceTimeouts: number;
    blockedActions: number;
  };
  alerts: OperationalAlert[];
};

type Snapshot = {
  runs: DashboardRun[];
  routingDecisions: DashboardRoutingDecision[];
  toolCalls: DashboardToolCall[];
  auditEvents: DashboardAuditEvent[];
  approvals: DashboardApproval[];
  scheduledJobs?: DashboardScheduledJob[];
  operationalHealth?: OperationalHealth;
};

export default function DashboardPage() {
  const [token, setToken] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [view, setView] = useState<DashboardView>("attention");
  const [message, setMessage] = useState("Enter a signed founder session to load persisted operations state.");
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadDashboard(event?: FormEvent) {
    event?.preventDefault();
    const session = token.trim();
    if (!session) {
      setError("A signed founder session is required.");
      setMessage("Dashboard not loaded.");
      setSnapshot(null);
      return;
    }

    setLoading(true);
    setError(null);
    setAccessDenied(false);
    setMessage("Loading persisted operations state...");

    try {
      const response = await fetch("/api/dashboard", {
        headers: { Authorization: `Bearer ${session}` },
        cache: "no-store",
      });
      const body = await response.json() as Snapshot & { error?: string };

      if (!response.ok) {
        setSnapshot(null);
        if (response.status === 401 || response.status === 403) {
          setAccessDenied(true);
          setError("Founder access was denied. Use a current signed founder session with founder access.");
        } else {
          setError(body.error ?? "Unable to load dashboard data.");
        }
        setMessage("Dashboard not loaded.");
        return;
      }

      setSnapshot(body);
      setMessage("Persisted operations state refreshed.");
    } catch (loadError) {
      setSnapshot(null);
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data.");
      setMessage("Dashboard not loaded.");
    } finally {
      setLoading(false);
    }
  }

  const dashboard = snapshot;
  const scheduledJobs = dashboard?.scheduledJobs ?? [];
  const operationalHealth = dashboard?.operationalHealth ?? null;
  const pendingApprovals = dashboard?.approvals.filter((approval) => approval.status === "pending") ?? [];
  const failedRuns = dashboard?.runs.filter((run) => run.status === "failed" || run.status === "blocked") ?? [];
  const blockedActions = dashboard?.toolCalls.filter((toolCall) => toolCall.outcome === "blocked" && toolCall.riskLevel >= 3) ?? [];
  const unhealthyJobs = scheduledJobs.filter((job) => job.status === "failed" || job.status === "retry_scheduled");
  const attentionRunIds = new Set([
    ...failedRuns.map((run) => run.id),
    ...blockedActions.map((toolCall) => toolCall.runId),
  ]);

  const visibleRuns = dashboard
    ? view === "attention"
      ? dashboard.runs.filter((run) => attentionRunIds.has(run.id))
      : dashboard.runs
    : [];
  const visibleRoutingDecisions = dashboard
    ? view === "attention"
      ? dashboard.routingDecisions.filter((decision) => attentionRunIds.has(decision.runId))
      : dashboard.routingDecisions
    : [];
  const visibleToolCalls = dashboard
    ? view === "attention"
      ? dashboard.toolCalls.filter((toolCall) => toolCall.outcome === "failed" || toolCall.outcome === "blocked")
      : dashboard.toolCalls
    : [];
  const visibleAuditEvents = dashboard
    ? view === "attention"
      ? dashboard.auditEvents.filter((event) => event.outcome === "failed" || event.outcome === "blocked")
      : dashboard.auditEvents
    : [];

  const counts = dashboard ? {
    running: dashboard.runs.filter((run) => run.status === "running").length,
    pendingApprovals: pendingApprovals.length,
    failedRuns: failedRuns.length,
    blockedActions: blockedActions.length,
    unhealthyJobs: unhealthyJobs.length,
    activeAlerts: operationalHealth?.alerts.length,
  } : null;

  return (
    <main className="approval-shell">
      <header className="approval-header">
        <div>
          <p className="eyebrow">Melato OS / Operations</p>
          <h1>Operations dashboard</h1>
          <p className="lede">Find failures, blocked high-risk actions, pending approvals, job health, and their correlated governance records without opening the database.</p>
        </div>
        <div className="header-mark" aria-hidden="true">OS</div>
      </header>

      <section className="access-panel" aria-labelledby="dashboard-access-heading">
        <div>
          <p className="section-kicker">Founder access</p>
          <h2 id="dashboard-access-heading">Load persisted operations state</h2>
          <p className="muted">The signed founder session stays in browser memory and is sent only to the protected dashboard endpoint.</p>
        </div>
        <form className="access-form" onSubmit={loadDashboard}>
          <label htmlFor="dashboard-token">Founder session token</label>
          <div className="access-row">
            <input
              id="dashboard-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste signed session"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={loading}>{loading ? "Loading..." : "Refresh operations"}</button>
          </div>
        </form>
      </section>

      <p className="queue-message" role="status" aria-live="polite">{message}</p>
      {error && <p className="queue-error" role="alert">{error}</p>}
      {accessDenied && (
        <div className="dashboard-permission-state" role="alert">
          <strong>Permission denied</strong>
          <span>No operational records were exposed.</span>
        </div>
      )}

      <section aria-busy={loading} aria-label="Persisted operations dashboard">
        {loading && !dashboard ? (
          <div className="dashboard-loading" role="status">
            <span className="loading-pulse" aria-hidden="true" />
            <h2>Loading operations</h2>
            <p>Reading protected persisted state and correlating recent records.</p>
          </div>
        ) : dashboard && counts ? (
          <>
            <section className="metric-grid" aria-label="Operations triage metrics">
              <Metric label="Pending approvals" value={counts.pendingApprovals} detail="awaiting founder decision" />
              <Metric label="Failed runs" value={counts.failedRuns} detail="failed or blocked runs" />
              <Metric label="Blocked actions" value={counts.blockedActions} detail="risk 3+ actions blocked" />
              <Metric label="Running now" value={counts.running} detail="persisted active runs" />
              <Metric label="Jobs needing attention" value={counts.unhealthyJobs} detail="failed or waiting to retry" />
              <Metric label="Operational alerts" value={counts.activeAlerts ?? "N/A"} detail={operationalHealth ? `last ${operationalHealth.windowMinutes} minutes` : "telemetry unavailable"} />
            </section>

            <section className="dashboard-section" aria-labelledby="job-health-heading">
              <div className="queue-toolbar">
                <div>
                  <p className="section-kicker">Scheduler</p>
                  <h2 id="job-health-heading">Job health</h2>
                  <p className="muted">Latest durable scheduler state, retry posture, failure class, and safe next action.</p>
                </div>
                <span className="dashboard-count">{scheduledJobs.length} recorded</span>
              </div>
              {scheduledJobs.length === 0 ? (
                <EmptyDashboard text="No scheduled job history is available yet." />
              ) : (
                <div className="operation-list">
                  {scheduledJobs.slice(0, 10).map((job) => (
                    <OperationRow
                      key={job.id}
                      title={formatAction(job.jobName)}
                      status={job.status}
                      statusTone={jobStatusTone(job.status)}
                    >
                      <span>Status: {formatAction(job.status)}</span>
                      <span>Attempt {job.attemptCount} of {job.maxAttempts}</span>
                      <span>{job.retryable ? "Retryable when policy allows" : "Not currently retryable"}</span>
                      {job.lastErrorCode && <span>Failure: {job.lastErrorCode}</span>}
                      {job.nextRetryAt && <span>Next retry: <time dateTime={job.nextRetryAt}>{formatDate(job.nextRetryAt)}</time></span>}
                      <span className="run-id">Correlation: {job.correlationId ?? "Correlation unavailable"}</span>
                      <strong>Next action: {jobActionCopy(job.recommendedAction)}</strong>
                      <time dateTime={job.updatedAt}>Updated {formatDate(job.updatedAt)}</time>
                    </OperationRow>
                  ))}
                </div>
              )}
            </section>

            <section className="dashboard-section attention-section" aria-labelledby="operational-alerts-heading">
              <div className="queue-toolbar">
                <div>
                  <p className="section-kicker">Observability</p>
                  <h2 id="operational-alerts-heading">Operational alerts</h2>
                  <p className="muted">Deterministic alerts from the protected 15-minute health policy.</p>
                </div>
              </div>
              {!operationalHealth ? (
                <p className="empty-inline" role="status">Operational alert telemetry is unavailable.</p>
              ) : operationalHealth.alerts.length === 0 ? (
                <p className="empty-inline" role="status">No operational alerts in the last {operationalHealth.windowMinutes} minutes.</p>
              ) : (
                <div className="operation-list">
                  {operationalHealth.alerts.map((alert) => (
                    <OperationRow
                      key={alert.code}
                      title={formatAction(alert.code)}
                      status={alert.severity}
                      statusTone={alert.severity === "critical" ? "danger" : "pending"}
                    >
                      <span>Severity: {formatAction(alert.severity)}</span>
                      <span>{alert.count} observed / threshold {alert.threshold}</span>
                      <span>Owner: {formatAction(alert.owner)}</span>
                      <strong>Next action: {alert.nextAction}</strong>
                    </OperationRow>
                  ))}
                </div>
              )}
            </section>

            <section className="dashboard-section attention-section" aria-labelledby="attention-heading">
              <div className="queue-toolbar">
                <div>
                  <p className="section-kicker">Needs attention</p>
                  <h2 id="attention-heading">Founder triage</h2>
                </div>
                <div className="filter-row dashboard-filter-row" aria-label="Filter dashboard activity">
                  <button type="button" className={view === "attention" ? "filter active" : "filter"} aria-pressed={view === "attention"} onClick={() => setView("attention")}>Needs attention</button>
                  <button type="button" className={view === "all" ? "filter active" : "filter"} aria-pressed={view === "all"} onClick={() => setView("all")}>All activity</button>
                </div>
              </div>

              <div className="triage-grid">
                <TriageCard title="Pending approvals" count={pendingApprovals.length} empty="No pending approval requests.">
                  {pendingApprovals.slice(0, 5).map((approval) => (
                    <OperationRow key={approval.id} title={formatAction(approval.actionType)} status={approval.status} statusTone="pending">
                      <span>{approval.requestingAgent}</span>
                      <span>Risk {approval.riskLevel}</span>
                      <span>{approval.target.type} / {approval.target.id}</span>
                      <time dateTime={approval.requestedAt}>{formatDate(approval.requestedAt)}</time>
                    </OperationRow>
                  ))}
                </TriageCard>

                <TriageCard title="Failed runs" count={failedRuns.length} empty="No failed or blocked runs.">
                  {failedRuns.slice(0, 5).map((run) => (
                    <OperationRow key={run.id} title={run.agentName} status={run.status} statusTone="danger">
                      <span className="run-id">Run ID: {run.id}</span>
                      <span>Risk {run.riskLevel}</span>
                      {run.errorCode && <span>Error: {run.errorCode}</span>}
                      {run.correlationId && <span>Correlation: {run.correlationId}</span>}
                      <time dateTime={run.createdAt}>{formatDate(run.createdAt)}</time>
                    </OperationRow>
                  ))}
                </TriageCard>

                <TriageCard title="Blocked actions" count={blockedActions.length} empty="No blocked high-risk actions.">
                  {blockedActions.slice(0, 5).map((toolCall) => (
                    <OperationRow key={toolCall.id} title={toolCall.toolName} status={toolCall.outcome} statusTone="danger">
                      <span className="run-id">Run ID: {toolCall.runId}</span>
                      <span>{toolCall.capability} · Risk {toolCall.riskLevel}</span>
                      {toolCall.errorCode && <span>Error: {toolCall.errorCode}</span>}
                      <time dateTime={toolCall.createdAt}>{formatDate(toolCall.createdAt)}</time>
                    </OperationRow>
                  ))}
                </TriageCard>
              </div>
            </section>

            <section className="dashboard-section" aria-labelledby="runs-heading">
              <div className="queue-toolbar">
                <div><p className="section-kicker">Execution state</p><h2 id="runs-heading">Agent runs</h2></div>
                <span className="dashboard-count">{visibleRuns.length} shown</span>
              </div>
              <div className="run-list">
                {visibleRuns.length === 0 ? <EmptyDashboard text={view === "attention" ? "No runs currently require attention." : "No agent runs have been recorded yet."} /> : visibleRuns.slice(0, 12).map((run) => (
                  <article className="run-row" key={run.id}>
                    <div className={`run-dot ${run.status}`} aria-hidden="true" />
                    <div className="run-main">
                      <strong>{run.agentName}</strong>
                      <span className="run-id">Run ID: {run.id}</span>
                      {run.correlationId && <span>Correlation: {run.correlationId}</span>}
                      {run.errorCode && <span>Error: {run.errorCode}</span>}
                    </div>
                    <div className="run-meta">
                      <span className={`status-badge ${statusClass(run.status)}`}>{run.status}</span>
                      <span>Risk {run.riskLevel}</span>
                      {run.durationMs !== undefined && <span>{run.durationMs} ms</span>}
                      <time dateTime={run.createdAt}>{formatDate(run.createdAt)}</time>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="dashboard-columns dashboard-columns-wide">
              <DashboardRecords title="Routing decisions" kicker="Why it routed" empty={view === "attention" ? "No routing decisions correlate to current attention items." : "No routing decisions recorded."}>
                {visibleRoutingDecisions.slice(0, 10).map((decision) => (
                  <OperationRow key={decision.id} title={decision.selectedAgent} status={decision.approvalRequired ? "approval required" : "routed"} statusTone={decision.approvalRequired ? "pending" : "neutral"}>
                    <span className="run-id">Run ID: {decision.runId}</span>
                    <span>{decision.reason}</span>
                    <span>Tools: {decision.neededTools.length ? decision.neededTools.join(", ") : "none"}</span>
                    <time dateTime={decision.createdAt}>{formatDate(decision.createdAt)}</time>
                  </OperationRow>
                ))}
              </DashboardRecords>

              <DashboardRecords title="Tool calls" kicker="Governed actions" empty={view === "attention" ? "No failed or blocked tool calls." : "No tool calls recorded."}>
                {visibleToolCalls.slice(0, 10).map((toolCall) => (
                  <OperationRow key={toolCall.id} title={toolCall.toolName} status={toolCall.outcome} statusTone={outcomeTone(toolCall.outcome)}>
                    <span className="run-id">Run ID: {toolCall.runId}</span>
                    <span>{toolCall.capability} · Risk {toolCall.riskLevel}</span>
                    {toolCall.errorCode && <span>Error: {toolCall.errorCode}</span>}
                    <time dateTime={toolCall.createdAt}>{formatDate(toolCall.createdAt)}</time>
                  </OperationRow>
                ))}
              </DashboardRecords>

              <DashboardRecords title="Audit events" kicker="Governance trail" empty={view === "attention" ? "No failed or blocked audit events." : "No audit events recorded."}>
                {visibleAuditEvents.slice(0, 10).map((event) => (
                  <OperationRow key={event.id} title={event.eventType} status={event.outcome} statusTone={outcomeTone(event.outcome)}>
                    {event.runId && <span className="run-id">Run ID: {event.runId}</span>}
                    {event.toolName && <span>{event.toolName}</span>}
                    {event.riskLevel !== undefined && <span>Risk {event.riskLevel}</span>}
                    <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
                  </OperationRow>
                ))}
              </DashboardRecords>
            </section>
          </>
        ) : !accessDenied ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">◌</span>
            <h3>Operations are private by default</h3>
            <p>Authenticate above to inspect safe persisted run, routing, tool, approval, job-health, and audit state.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function TriageCard({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="triage-card">
      <div className="triage-heading"><h3>{title}</h3><span>{count}</span></div>
      <div className="operation-list">{count === 0 ? <p className="empty-inline">{empty}</p> : children}</div>
    </section>
  );
}

function DashboardRecords({ title, kicker, empty, children }: { title: string; kicker: string; empty: string; children: React.ReactNode }) {
  const childCount = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <section className="dashboard-section compact dashboard-records">
      <p className="section-kicker">{kicker}</p>
      <h2>{title}</h2>
      <div className="operation-list">{childCount === 0 ? <p className="empty-inline">{empty}</p> : children}</div>
    </section>
  );
}

function OperationRow({ title, status, statusTone, children }: { title: string; status: string; statusTone: "pending" | "danger" | "success" | "neutral"; children: React.ReactNode }) {
  return (
    <article className="operation-row">
      <div className="operation-heading">
        <strong>{title}</strong>
        <span className={`operation-status ${statusTone}`}>{status}</span>
      </div>
      <div className="operation-meta">{children}</div>
    </article>
  );
}

function EmptyDashboard({ text }: { text: string }) {
  return <div className="empty-inline">{text}</div>;
}

function statusClass(status: string) {
  return status === "completed" ? "approved" : status === "blocked" || status === "failed" ? "rejected" : "pending";
}

function outcomeTone(outcome: Outcome): "danger" | "success" | "neutral" {
  return outcome === "succeeded" ? "success" : outcome === "failed" || outcome === "blocked" ? "danger" : "neutral";
}

function jobStatusTone(status: ScheduledJobStatus): "pending" | "danger" | "success" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "retry_scheduled") return "pending";
  return "neutral";
}

function jobActionCopy(action: JobAction) {
  if (action === "none") return "No action required.";
  if (action === "wait_for_completion") return "Job is running. Do not start a duplicate while its lease is active.";
  if (action === "wait_for_retry") return "Wait for the scheduled retry window. Do not force an early retry.";
  return "Inspect the correlation trail and failure code before deciding whether to retry.";
}

function formatAction(action: string) {
  return action.replaceAll("_", " ").replaceAll(".", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
