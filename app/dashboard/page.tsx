"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentRunRecord, ApprovalRecord, AuditEventRecord, RoutingDecisionRecord, ToolCallRecord } from "../../lib/execution/repository";
import { getNewestFirst, summarizeExecutionHealth, type ExecutionHealth } from "../../lib/ui/executions";

type DashboardData = {
  runs: AgentRunRecord[];
  routingDecisions: RoutingDecisionRecord[];
  approvals: ApprovalRecord[];
  toolCalls: ToolCallRecord[];
  auditEvents: AuditEventRecord[];
};

const emptyData: DashboardData = { runs: [], routingDecisions: [], approvals: [], toolCalls: [], auditEvents: [] };

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [health, setHealth] = useState<ExecutionHealth>(() => summarizeExecutionHealth(emptyData));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/executions", { cache: "no-store" });
      const body = (await response.json()) as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load execution history");
      const next = { ...emptyData, ...body } as DashboardData;
      setData(next);
      setHealth(summarizeExecutionHealth(next));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load execution history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  return (
    <main className="approval-shell">
      <div className="approval-header">
        <div>
          <p className="eyebrow">Melato OS · execution intelligence</p>
          <h1>Command centre</h1>
          <p className="lede">A quiet, persistent view of what the swarm decided, attempted, and changed.</p>
        </div>
        <button className="secondary-button" onClick={() => void loadDashboard()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <section className="metric-grid" aria-label="Execution health">
        <article className="metric-card"><span>Agent runs</span><strong>{health.totalRuns}</strong><small>{health.activeRuns} active</small></article>
        <article className="metric-card"><span>Failed runs</span><strong>{health.failedRuns}</strong><small>Needs review</small></article>
        <article className="metric-card"><span>Tool calls</span><strong>{health.successfulToolCalls}</strong><small>{health.blockedToolCalls} blocked</small></article>
        <article className="metric-card"><span>Pending approvals</span><strong>{health.pendingApprovals}</strong><small>Governed actions</small></article>
      </section>
      {loading ? <p className="empty-state">Loading the execution ledger…</p> : (
        <div className="dashboard-columns">
          <section className="dashboard-panel"><div className="panel-heading"><div><p className="eyebrow">Runs</p><h2>Recent agent work</h2></div><span>{data.runs.length}</span></div>{data.runs.length === 0 ? <p className="muted">No agent runs recorded yet.</p> : <div className="ledger-list">{getNewestFirst(data.runs).slice(0, 8).map((run) => <article className="ledger-row" key={run.id}><div><strong>{run.agentName}</strong><p>{run.inputSummary ?? "No input summary"}</p></div><div className="ledger-meta"><span className={`status status-${run.status}`}>{run.status}</span><small>{formatDate(run.createdAt)}</small></div></article>)}</div>}</section>
          <section className="dashboard-panel"><div className="panel-heading"><div><p className="eyebrow">Governance trail</p><h2>Routing & audit</h2></div><span>{data.auditEvents.length}</span></div>{data.auditEvents.length === 0 ? <p className="muted">No audit events recorded yet.</p> : <div className="ledger-list">{getNewestFirst(data.auditEvents).slice(0, 8).map((event) => <article className="ledger-row" key={event.id}><div><strong>{event.eventType}</strong><p>{event.agentName ?? "System"}{event.toolName ? ` · ${event.toolName}` : ""}</p></div><div className="ledger-meta"><span className={`status status-${event.outcome}`}>{event.outcome}</span><small>{formatDate(event.createdAt)}</small></div></article>)}</div>}</section>
        </div>
      )}
    </main>
  );
}
