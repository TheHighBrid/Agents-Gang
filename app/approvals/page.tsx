"use client";

import { useCallback, useEffect, useState } from "react";

type Approval = {
  id: string;
  requestingAgent: string;
  actionType: string;
  target: { type: string; id: string };
  riskLevel: number;
  payloadSummary: string;
  status: "pending" | "approved" | "rejected" | "expired";
  requestedAt: string;
  decidedAt?: string;
  result?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/approvals", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load approvals");
      setApprovals(body.approvals);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadApprovals();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadApprovals]);

  async function decide(approvalId: string, status: "approved" | "rejected") {
    setBusyId(approvalId);
    setError(undefined);
    try {
      const response = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId,
          status,
          result: status === "approved" ? "Approved from approvals dashboard." : "Rejected from approvals dashboard.",
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to decide approval");
      setApprovals((current) => current.map((approval) => approval.id === approvalId ? body.approval : approval));
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Unable to decide approval");
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Governed execution</p>
          <h1>Approvals</h1>
          <p>Review prepared actions before anything changes in Shopify, Gmail, or another connected system.</p>
        </div>
        <button className="secondary-button" onClick={() => void loadApprovals()} disabled={loading}>Refresh</button>
      </div>

      {error && <p className="error-banner" role="alert">{error}</p>}
      {loading ? <p className="muted">Loading persisted approvals…</p> : approvals.length === 0 ? (
        <section className="empty-state"><h2>Nothing is waiting</h2><p>New level 3 and level 4 actions will appear here for review.</p></section>
      ) : (
        <section className="approval-list" aria-label="Approval requests">
          {approvals.map((approval) => (
            <article className="approval-card" key={approval.id}>
              <div className="approval-card-heading">
                <div><p className="eyebrow">{approval.requestingAgent}</p><h2>{approval.actionType}</h2></div>
                <span className={`status status-${approval.status}`}>{approval.status}</span>
              </div>
              <p>{approval.payloadSummary}</p>
              <dl className="approval-details">
                <div><dt>Target</dt><dd>{approval.target.type} / {approval.target.id}</dd></div>
                <div><dt>Risk</dt><dd>Level {approval.riskLevel}</dd></div>
                <div><dt>Requested</dt><dd>{formatDate(approval.requestedAt)}</dd></div>
              </dl>
              {approval.result && <p className="muted">{approval.result}</p>}
              {approval.status === "pending" && (
                <div className="approval-actions">
                  <button className="primary-button" onClick={() => void decide(approval.id, "approved")} disabled={busyId === approval.id}>Approve</button>
                  <button className="danger-button" onClick={() => void decide(approval.id, "rejected")} disabled={busyId === approval.id}>Reject</button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
