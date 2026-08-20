"use client";

import { useCallback, useEffect, useState } from "react";

type RunStatus = "running" | "completed" | "failed" | "blocked";
type Outcome = "blocked" | "succeeded" | "failed";
type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "consumed";
type DashboardView = "attention" | "all";
type ScheduledJobStatus = "running" | "retry_scheduled" | "completed" | "failed";
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
  recommendedAction: string;
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
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [view, setView] = useState<DashboardView>("attention");
  const [message, setMessage] = useState("Loading persisted operations state...");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage("Loading persisted operations state...");

    try {
      const response = await fetch("/api/dashboard", {
        method: "GET",
        cache: "no-store",
      });
      const body = await response.json() as Snapshot & { error?: string };
      if (!response.ok) {
        setSnapshot(null);
        setError(body.error ?? "Unable to load dashboard data.");
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
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

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
    ? view === "attention" ? dashboard.runs.filter((run) => attentionRunIds.has(run.id)) : dashboard.runs
    : [];
  const visibleRoutingDecisions = dashboard
    ? view === "attention" ? dashboard.routingDecisions.filter((decision) => attentionRunIds.has(decision.runId)) : dashboard.routingDecisions
    : [];
  const visibleToolCalls = dashboard
    ? view === "attention" ? dashboard.toolCalls.filter((toolCall) => toolCall.outcome === "failed" || toolCall.outcome === "blocked") : dashboard.toolCalls
    : [];
  const visibleAuditEvents = dashboard
    ? view === "attention" ? dashboard.auditEvents.filter((event) => event.outcome === "failed" || event.outcome === "blocked") : dashboard.auditEvents
    : [];

  const counts = dashboard ? {
    running: dashboard.runs.filter((run) => run.status === "running").length,
    pendingApprovals: pendingApprovals.length,
    failedRuns: failedRuns.length,
    blockedActions: blockedActions.length,
    unhealthyJobs: unhealthyJobs.length,
    activeAlerts: operationalHealth?.alerts.length ?? 0,
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

      <section className="access-panel" aria-labelledby="dashboard-testing-heading">
        <div>
          <p className="section-kicker">Testing mode</p>
          <h2 id="dashboard-testing-heading">Authentication disabled</h2>
          <p className="muted">The dashboard loads persisted operations directly while the app is under active testing. No founder secret or session token is required.</p>
        </div>
        <button type="button" onClick={() => void loadDashboard()} disabled={loading}>
          {loading ? "Loading..." : "Refresh operations"}
        </button>
      </section>

      <p className="queue-message" role="status" aria-live="polite">{message}</p>
      {error && <p className="queue-error" role="alert">{error}</p>}

      <section aria-busy={loading} aria-label="Persisted operations dashboard">
        {loading && !dashboard ? (
          <div className="dashboard-loading" role="status">
            <span className="loading-pulse" aria-hidden="true" />
            <h2>Loading operations</h2>
            <p>Reading persisted state and correlating recent records.</p>
          </div>
        ) : dashboard && counts ? (
          <>
            <section className="metric-grid" aria-label="Operations triage metrics">
              <Metric label="Pending approvals" value={counts.pendingApprovals} detail="awaiting a decision" />
              <Metric label="Failed runs" value={counts.failedRuns} detail="failed or blocked runs" />
              <Metric label="Blocked actions" value={counts.blockedActions} detail="risk 3+ actions blocked" />
              <Metric label="Running now" value={counts.running} detail="persisted active runs" />
              <Metric label="Jobs needing attention" value={counts.unhealthyJobs} detail="failed or waiting to retry" />
              <Metric label="Operational alerts" value={counts.activeAlerts} detail={operationalHealth ? `last ${operationalHealth.windowMinutes} minutes` : "telemetry unavailable"} />
            </section>

            <section className="dashboard-section" aria-labelledby="job-health-heading">
              <SectionHeading kicker="Scheduler" title="Job health" id="job-health-heading" count={`${scheduledJobs.length} recorded`} />
              {scheduledJobs.length === 0 ? <EmptyDashboard text="No scheduled job history is available yet." /> : (
                <div className="operation-list">
                  {scheduledJobs.slice(0, 10).map((job) => (
                    <OperationRow key={job.id} title={formatAction(job.jobName)} status={job.status}>
                      <span>Attempt {job.attemptCount} of {job.maxAttempts}</span>
                      <span>{job.retryable ? "Retryable when policy allows" : "Not currently retryable"}</span>
                      {job.lastErrorCode && <span>Failure: {job.lastErrorCode}</span>}
                      {job.nextRetryAt && <span>Next retry: <time dateTime={job.nextRetryAt}>{formatDate(job.nextRetryAt)}</time></span>}
                      <span className="run-id">Correlation: {job.correlationId ?? "Unavailable"}</span>
                      <strong>Next action: {formatAction(job.recommendedAction)}</strong>
                    </OperationRow>
                  ))}
                </div>
              )}
            </section>

            <section className="dashboard-section attention-section" aria-labelledby="operational-alerts-heading">
              <SectionHeading kicker="Observability" title="Operational alerts" id="operational-alerts-heading" />
              {!operationalHealth ? <EmptyDashboard text="Operational alert telemetry is unavailable." /> : operationalHealth.alerts.length === 0 ? (
                <EmptyDashboard text={`No operational alerts in the last ${operationalHealth.windowMinutes} minutes.`} />
              ) : (
                <div className="operation-list">
                  {operationalHealth.alerts.map((alert) => (
                    <OperationRow key={alert.code} title={formatAction(alert.code)} status={alert.severity}>
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
                <Triage title="Pending approvals" empty="No pending approval requests." items={pendingApprovals.slice(0, 5).map((approval) => ({
                  id: approval.id,
                  title: formatAction(approval.actionType),
                  status: approval.status,
                  detail: `${approval.requestingAgent} · Risk ${approval.riskLevel}`,
                }))} />
                <Triage title="Failed runs" empty="No failed or blocked runs." items={failedRuns.slice(0, 5).map((run) => ({
                  id: run.id,
                  title: formatAction(run.agentName),
                  status: run.status,
                  detail: `Run ID ${run.id}${run.errorCode ? ` · ${run.errorCode}` : ""}`,
                }))} />
                <Triage title="Blocked actions" empty="No high-risk blocked actions." items={blockedActions.slice(0, 5).map((toolCall) => ({
                  id: toolCall.id,
                  title: formatAction(toolCall.toolName),
                  status: toolCall.outcome,
                  detail: `Run ID ${toolCall.runId} · Risk ${toolCall.riskLevel}`,
                }))} />
              </div>
            </section>

            <section className="dashboard-section" aria-labelledby="runs-heading">
              <SectionHeading kicker="Execution" title="Runs" id="runs-heading" count={`${visibleRuns.length} shown`} />
              <div className="operation-list">
                {visibleRuns.length === 0 ? <EmptyDashboard text="No runs match this view." /> : visibleRuns.slice(0, 20).map((run) => (
                  <OperationRow key={run.id} title={formatAction(run.agentName)} status={run.status}>
                    <span>Run ID {run.id}</span><span>Risk {run.riskLevel}</span>{run.errorCode && <span>{run.errorCode}</span>}
                  </OperationRow>
                ))}
              </div>
            </section>

            <section className="dashboard-section" aria-labelledby="routing-heading">
              <SectionHeading kicker="Routing" title="Routing decisions" id="routing-heading" count={`${visibleRoutingDecisions.length} shown`} />
              <div className="operation-list">
                {visibleRoutingDecisions.length === 0 ? <EmptyDashboard text="No routing decisions match this view." /> : visibleRoutingDecisions.slice(0, 20).map((decision) => (
                  <OperationRow key={decision.id} title={formatAction(decision.selectedAgent)} status={decision.approvalRequired ? "approval required" : "routed"}>
                    <span>Run ID {decision.runId}</span><span>Risk {decision.riskLevel}</span><span>{decision.reason}</span>
                  </OperationRow>
                ))}
              </div>
            </section>

            <section className="dashboard-section" aria-labelledby="tools-heading">
              <SectionHeading kicker="Tools" title="Tool calls" id="tools-heading" count={`${visibleToolCalls.length} shown`} />
              <div className="operation-list">
                {visibleToolCalls.length === 0 ? <EmptyDashboard text="No tool calls match this view." /> : visibleToolCalls.slice(0, 20).map((call) => (
                  <OperationRow key={call.id} title={formatAction(call.toolName)} status={call.outcome}>
                    <span>Run ID {call.runId}</span><span>{formatAction(call.capability)}</span><span>Risk {call.riskLevel}</span>{call.errorCode && <span>{call.errorCode}</span>}
                  </OperationRow>
                ))}
              </div>
            </section>

            <section className="dashboard-section" aria-labelledby="audit-heading">
              <SectionHeading kicker="Governance" title="Audit events" id="audit-heading" count={`${visibleAuditEvents.length} shown`} />
              <div className="operation-list">
                {visibleAuditEvents.length === 0 ? <EmptyDashboard text="No audit events match this view." /> : visibleAuditEvents.slice(0, 20).map((event) => (
                  <OperationRow key={event.id} title={formatAction(event.eventType)} status={event.outcome}>
                    {event.runId && <span>Run ID {event.runId}</span>}{event.agentName && <span>{formatAction(event.agentName)}</span>}
                  </OperationRow>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">◌</span>
            <h3>No operations data loaded</h3>
            <p>Refresh the dashboard to try again.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function SectionHeading({ kicker, title, id, count }: { kicker: string; title: string; id: string; count?: string }) {
  return <div className="queue-toolbar"><div><p className="section-kicker">{kicker}</p><h2 id={id}>{title}</h2></div>{count && <span className="dashboard-count">{count}</span>}</div>;
}

function OperationRow({ title, status, children }: { title: string; status: string; children: React.ReactNode }) {
  return <article className="operation-row"><div className="operation-row-heading"><h3>{title}</h3><span className="status-badge">{formatAction(status)}</span></div><div className="operation-meta">{children}</div></article>;
}

function Triage({ title, empty, items }: { title: string; empty: string; items: Array<{ id: string; title: string; status: string; detail: string }> }) {
  return <article className="triage-card"><div className="card-topline"><h3>{title}</h3><span>{items.length}</span></div>{items.length === 0 ? <p>{empty}</p> : <div className="operation-list">{items.map((item) => <OperationRow key={item.id} title={item.title} status={item.status}><span>{item.detail}</span></OperationRow>)}</div>}</article>;
}

function EmptyDashboard({ text }: { text: string }) {
  return <p className="empty-inline" role="status">{text}</p>;
}

function formatAction(value: string) {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
