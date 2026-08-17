"use client";

import { FormEvent, useMemo, useState } from "react";

type ApprovalStatus = "pending" | "approved" | "rejected";

type Approval = {
  id: string;
  requestingAgent: string;
  actionType: string;
  target: { type: string; id: string };
  riskLevel: number;
  payloadSummary: string;
  status: ApprovalStatus;
  requestedAt: string;
  updatedAt: string;
  decidedAt?: string;
  result?: string;
};

const statusLabels: Record<ApprovalStatus | "all", string> = {
  all: "All requests",
  pending: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
};

export default function ApprovalsPage() {
  const [token, setToken] = useState("");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [filter, setFilter] = useState<ApprovalStatus | "all">("pending");
  const [message, setMessage] = useState("Enter the approval API token to load the queue.");
  const [loading, setLoading] = useState(false);

  const visibleApprovals = useMemo(
    () => filter === "all" ? approvals : approvals.filter((approval) => approval.status === filter),
    [approvals, filter],
  );

  async function loadApprovals(event?: FormEvent) {
    event?.preventDefault();
    if (!token.trim()) {
      setMessage("A founder approval token is required.");
      return;
    }
    setLoading(true);
    setMessage("Loading approval queue…");
    try {
      const response = await fetch("/api/approvals", {
        headers: { Authorization: `Bearer ${token.trim()}` },
        cache: "no-store",
      });
      const body = await response.json() as { approvals?: Approval[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load approvals");
      setApprovals(body.approvals ?? []);
      setMessage(`${body.approvals?.length ?? 0} approval requests loaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load approvals");
    } finally {
      setLoading(false);
    }
  }

  async function decide(approvalId: string, status: Extract<ApprovalStatus, "approved" | "rejected">, result: string) {
    if (!result.trim()) {
      setMessage("Add a short decision note before submitting.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status, result }),
      });
      const body = await response.json() as { approval?: Approval; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to save decision");
      if (body.approval) {
        setApprovals((current) => current.map((item) => item.id === body.approval?.id ? body.approval : item));
      }
      setMessage(`Request ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save decision");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="approval-shell">
      <header className="approval-header">
        <div>
          <p className="eyebrow">Melato OS / Governance</p>
          <h1>Approval queue</h1>
          <p className="lede">Review prepared actions before they reach Shopify, inboxes, calendars, or customer-facing surfaces.</p>
        </div>
        <div className="header-mark" aria-hidden="true">MG</div>
      </header>

      <section className="access-panel" aria-labelledby="access-heading">
        <div>
          <p className="section-kicker">Founder access</p>
          <h2 id="access-heading">Open the governed queue</h2>
          <p className="muted">The token is used only for this browser session and is never sent anywhere except the approval API.</p>
        </div>
        <form className="access-form" onSubmit={loadApprovals}>
          <label htmlFor="approval-token">Approval API token</label>
          <div className="access-row">
            <input
              id="approval-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste token"
              autoComplete="off"
            />
            <button type="submit" disabled={loading}>{loading ? "Loading…" : "Load queue"}</button>
          </div>
        </form>
      </section>

      <section className="queue-toolbar" aria-label="Approval filters">
        <div>
          <p className="section-kicker">Decision desk</p>
          <h2>Requests requiring judgment</h2>
        </div>
        <div className="filter-row" role="tablist" aria-label="Filter approvals">
          {(Object.keys(statusLabels) as Array<ApprovalStatus | "all">).map((status) => (
            <button
              key={status}
              type="button"
              className={filter === status ? "filter active" : "filter"}
              onClick={() => setFilter(status)}
              role="tab"
              aria-selected={filter === status}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>
      </section>

      <p className="queue-message" role="status">{message}</p>

      <section className="approval-grid" aria-live="polite">
        {visibleApprovals.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">✓</span>
            <h3>{filter === "pending" ? "The queue is clear" : "No matching requests"}</h3>
            <p>Prepared actions will appear here with their target, risk level, and decision history.</p>
          </div>
        ) : visibleApprovals.map((approval) => (
          <ApprovalCard key={approval.id} approval={approval} loading={loading} onDecide={decide} />
        ))}
      </section>
    </main>
  );
}

function ApprovalCard({
  approval,
  loading,
  onDecide,
}: {
  approval: Approval;
  loading: boolean;
  onDecide: (id: string, status: Extract<ApprovalStatus, "approved" | "rejected">, result: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const isPending = approval.status === "pending";

  return (
    <article className={`approval-card ${isPending ? "pending" : "resolved"}`}>
      <div className="card-topline">
        <span className={`status-badge ${approval.status}`}>{approval.status}</span>
        <span className="risk-badge">Risk {approval.riskLevel}</span>
      </div>
      <h3>{formatAction(approval.actionType)}</h3>
      <p className="payload">{approval.payloadSummary}</p>
      <dl className="approval-meta">
        <div><dt>Requested by</dt><dd>{approval.requestingAgent}</dd></div>
        <div><dt>Target</dt><dd>{approval.target.type} / {approval.target.id}</dd></div>
        <div><dt>Requested</dt><dd>{formatDate(approval.requestedAt)}</dd></div>
      </dl>
      {approval.result && <p className="decision-note"><strong>Decision note:</strong> {approval.result}</p>}
      {isPending && (
        <div className="decision-panel">
          <label htmlFor={`note-${approval.id}`}>Decision note</label>
          <textarea
            id={`note-${approval.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why is this safe to proceed?"
            rows={2}
          />
          <div className="decision-actions">
            <button type="button" className="reject" disabled={loading} onClick={() => onDecide(approval.id, "rejected", note)}>Reject</button>
            <button type="button" className="approve" disabled={loading} onClick={() => onDecide(approval.id, "approved", note)}>Approve action</button>
          </div>
        </div>
      )}
    </article>
  );
}

function formatAction(action: string) {
  return action.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
