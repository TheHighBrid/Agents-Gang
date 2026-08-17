"use client";

import { useCallback, useEffect, useState } from "react";

type AgentRun = {
  id: string;
  agentName: string;
  provider: string;
  model: string;
  routeAgent: string;
  riskLevel: number;
  status: "running" | "completed" | "failed" | "blocked";
  createdAt: string;
  completedAt?: string;
  inputSummary?: string;
  outputSummary?: string;
  errorCode?: string;
  durationMs?: number;
};

type RoutingDecision = {
  id: string;
  runId: string;
  selectedAgent: string;
  riskLevel: number;
  reason: string;
  neededTools: string[];
  approvalRequired: boolean;
  createdAt: string;
};

type AuditEvent = {
  id: string;
  runId?: string;
  agentName?: string;
  toolName?: string;
  riskLevel?: number;
  approvalId?: string;
  eventType: string;
  outcome: "blocked" | "succeeded" | "failed";
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

type OperationalAlert = {
  key: string;
  severity: "warning" | "critical";
  count: number;
  threshold: number;
  owner: string;
  message: string;
};

type OperationalHealth = {
  metrics: {
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    runningRuns: number;
    retryableFailedRuns: number;
    providerTimeouts: number;
    persistenceTimeouts: number;
    blockedEvents: number;
  };
  alerts: OperationalAlert[];
};

type DashboardData = {
  runs: AgentRun[];
  routingDecisions: RoutingDecision[];
  auditEvents: AuditEvent[];
  operationalHealth?: OperationalHealth;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: string) {
  return `status status-${status}`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({ runs: [], routingDecisions: [], auditEvents: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load dashboard data");
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const latestRuns = data.runs.slice(0, 10);
  const latestDecisions = data.routingDecisions.slice(0, 10);
  const latestEvents = data.auditEvents.slice(0, 20);

  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Melato OS / persisted operations</p>
          <h1>Today&apos;s Melato OS</h1>
          <p>Review what the agent system ran, how requests were routed, and which governed events were recorded.</p>
        </div>
        <button className="secondary-button" onClick={() => void loadDashboard()} disabled={loading}>Refresh</button>
      </div>

      {error && <p className="error-banner" role="alert">{error}</p>}
      {loading ? <p className="muted">Loading persisted operations…</p> : (
        <>
          <section className="metric-grid" aria-label="Dashboard totals">
            <div className="metric-card"><span>Runs</span><strong>{data.runs.length}</strong></div>
            <div className="metric-card"><span>Routing decisions</span><strong>{data.routingDecisions.length}</strong></div>
            <div className="metric-card"><span>Audit events</span><strong>{data.auditEvents.length}</strong></div>
            <div className="metric-card"><span>Open runs</span><strong>{data.runs.filter((run) => run.status === "running").length}</strong></div>
          </section>

          <section className="dashboard-section">
            <div className="section-heading"><div><p className="eyebrow">Operational health</p><h2>Metrics and alerts</h2></div><span className="muted">Persisted snapshot</span></div>
            {data.operationalHealth ? (
              <>
                <div className="metric-grid" aria-label="Operational health metrics">
                  <div className="metric-card"><span>Failed runs</span><strong>{data.operationalHealth.metrics.failedRuns}</strong></div>
                  <div className="metric-card"><span>Retryable failures</span><strong>{data.operationalHealth.metrics.retryableFailedRuns}</strong></div>
                  <div className="metric-card"><span>Provider timeouts</span><strong>{data.operationalHealth.metrics.providerTimeouts}</strong></div>
                  <div className="metric-card"><span>Blocked actions</span><strong>{data.operationalHealth.metrics.blockedEvents}</strong></div>
                </div>
                {data.operationalHealth.alerts.length === 0 ? <p className="empty-state">No active operational alerts in this snapshot.</p> : (
                  <div className="record-list">{data.operationalHealth.alerts.map((alert) => <article className="record-row" key={alert.key}><div><strong>{alert.message}</strong><p>{alert.key.replaceAll("_", " ")} · Owner: {alert.owner}</p></div><div className="record-meta"><span className={statusClass(alert.severity === "critical" ? "failed" : "blocked")}>{alert.severity}</span><span>{alert.count} / {alert.threshold}</span></div></article>)}</div>
                )}
              </>
            ) : <p className="empty-state">Operational metrics are unavailable for this response.</p>}
          </section>

          <section className="dashboard-section">
            <div className="section-heading"><div><p className="eyebrow">Execution history</p><h2>Agent runs</h2></div><span className="muted">Latest 10</span></div>
            {latestRuns.length === 0 ? <p className="empty-state">No agent runs have been persisted yet.</p> : (
              <div className="table-wrap"><table><thead><tr><th>Status</th><th>Agent</th><th>Route</th><th>Risk</th><th>Started</th><th>Duration</th></tr></thead><tbody>
                {latestRuns.map((run) => <tr key={run.id}><td><span className={statusClass(run.status)}>{run.status}</span></td><td><strong>{run.agentName}</strong><small>{run.inputSummary ?? "No input summary"}</small></td><td>{run.routeAgent}</td><td>Level {run.riskLevel}</td><td>{formatDate(run.createdAt)}</td><td>{run.durationMs ? `${run.durationMs} ms` : "—"}</td></tr>)}
              </tbody></table></div>
            )}
          </section>

          <section className="dashboard-section">
            <div className="section-heading"><div><p className="eyebrow">Orchestration trace</p><h2>Routing decisions</h2></div><span className="muted">Latest 10</span></div>
            {latestDecisions.length === 0 ? <p className="empty-state">No routing decisions have been persisted yet.</p> : (
              <div className="record-list">{latestDecisions.map((decision) => <article className="record-row" key={decision.id}><div><strong>{decision.selectedAgent}</strong><p>{decision.reason}</p></div><div className="record-meta"><span>Risk {decision.riskLevel}</span><span>{decision.approvalRequired ? "Approval required" : "No approval"}</span><span>{formatDate(decision.createdAt)}</span></div></article>)}</div>
            )}
          </section>

          <section className="dashboard-section">
            <div className="section-heading"><div><p className="eyebrow">Governance trace</p><h2>Audit log</h2></div><span className="muted">Latest 20</span></div>
            {latestEvents.length === 0 ? <p className="empty-state">No audit events have been recorded yet.</p> : (
              <div className="record-list">{latestEvents.map((event) => <article className="record-row" key={event.id}><div><strong>{event.eventType}</strong><p>{event.agentName ?? event.toolName ?? "System event"}{event.runId ? ` · Run ${event.runId}` : ""}</p></div><div className="record-meta"><span className={statusClass(event.outcome)}>{event.outcome}</span><span>{formatDate(event.createdAt)}</span></div></article>)}</div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
