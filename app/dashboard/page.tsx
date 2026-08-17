"use client";

import { FormEvent, useState } from "react";

type Snapshot = {
  runs: Array<{ id: string; agentName: string; status: string; riskLevel: number; createdAt: string; inputSummary?: string }>;
  toolCalls: Array<{ id: string; toolName: string; outcome: string; createdAt: string }>;
  auditEvents: Array<{ id: string; eventType: string; outcome: string; createdAt: string }>;
  approvals: Array<{ id: string; actionType: string; status: string; riskLevel: number; requestedAt: string }>;
};

export default function DashboardPage() {
  const [token, setToken] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("Enter the founder token to load execution telemetry.");
  const [loading, setLoading] = useState(false);

  async function loadDashboard(event?: FormEvent) {
    event?.preventDefault();
    if (!token.trim()) {
      setMessage("A founder approval token is required.");
      return;
    }
    setLoading(true);
    setMessage("Loading execution telemetry…");
    try {
      const response = await fetch("/api/dashboard", {
        headers: { Authorization: `Bearer ${token.trim()}` },
        cache: "no-store",
      });
      const body = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load dashboard");
      setSnapshot(body);
      setMessage("Telemetry refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  const dashboard = snapshot;
  const counts = dashboard ? {
    runs: dashboard.runs.length,
    active: dashboard.runs.filter((run) => run.status === "running").length,
    approvals: dashboard.approvals.filter((approval) => approval.status === "pending").length,
    failures: dashboard.runs.filter((run) => run.status === "failed").length,
  } : null;

  return (
    <main className="approval-shell">
      <header className="approval-header">
        <div>
          <p className="eyebrow">Melato OS / Observability</p>
          <h1>Execution overview</h1>
          <p className="lede">A calm, reviewable view of what the agent system ran, why it routed there, and what still needs attention.</p>
        </div>
        <div className="header-mark" aria-hidden="true">OS</div>
      </header>

      <section className="access-panel" aria-labelledby="dashboard-access-heading">
        <div>
          <p className="section-kicker">Founder access</p>
          <h2 id="dashboard-access-heading">Load live telemetry</h2>
          <p className="muted">Execution records remain server-side. The token is held in memory for this browser session only.</p>
        </div>
        <form className="access-form" onSubmit={loadDashboard}>
          <label htmlFor="dashboard-token">Approval API token</label>
          <div className="access-row">
            <input id="dashboard-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token" autoComplete="off" />
            <button type="submit" disabled={loading}>{loading ? "Loading…" : "Refresh telemetry"}</button>
          </div>
        </form>
      </section>

      <p className="queue-message" role="status">{message}</p>

      {dashboard && counts ? (
        <>
          <section className="metric-grid" aria-label="Execution metrics">
            <Metric label="Agent runs" value={counts.runs} detail="persisted executions" />
            <Metric label="Running now" value={counts.active} detail="active runs" />
            <Metric label="Pending approvals" value={counts.approvals} detail="awaiting decision" />
            <Metric label="Failed runs" value={counts.failures} detail="requiring review" />
          </section>

          <section className="dashboard-section">
            <div className="queue-toolbar"><div><p className="section-kicker">Recent activity</p><h2>Agent runs</h2></div></div>
            <div className="run-list">
              {dashboard.runs.length === 0 ? <EmptyDashboard text="No agent runs have been recorded yet." /> : dashboard.runs.slice(0, 12).map((run) => (
                <article className="run-row" key={run.id}>
                  <div className={`run-dot ${run.status}`} aria-hidden="true" />
                  <div className="run-main"><strong>{run.agentName}</strong><span>{run.inputSummary ?? "No input summary"}</span></div>
                  <div className="run-meta"><span className={`status-badge ${statusClass(run.status)}`}>{run.status}</span><span>Risk {run.riskLevel}</span><time>{formatDate(run.createdAt)}</time></div>
                </article>
              ))}
            </div>
          </section>

          <section className="dashboard-columns">
            <DashboardList title="Tool calls" kicker="Actions" items={dashboard.toolCalls.map((item) => `${item.toolName} · ${item.outcome}`)} empty="No tool calls recorded." />
            <DashboardList title="Audit events" kicker="Governance" items={dashboard.auditEvents.map((item) => `${item.eventType} · ${item.outcome}`)} empty="No audit events recorded." />
          </section>
        </>
      ) : <div className="empty-state"><span className="empty-icon" aria-hidden="true">◌</span><h3>Telemetry is private by default</h3><p>Authenticate above to inspect persisted agent activity and governance state.</p></div>}
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function DashboardList({ title, kicker, items, empty }: { title: string; kicker: string; items: string[]; empty: string }) {
  return <section className="dashboard-section compact"><p className="section-kicker">{kicker}</p><h2>{title}</h2>{items.length === 0 ? <p className="muted">{empty}</p> : <ul className="activity-list">{items.slice(0, 8).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}</section>;
}

function EmptyDashboard({ text }: { text: string }) { return <div className="empty-inline">{text}</div>; }
function statusClass(status: string) { return status === "completed" ? "approved" : status === "blocked" || status === "failed" ? "rejected" : "pending"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
