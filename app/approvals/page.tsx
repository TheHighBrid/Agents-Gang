"use client";

import { useEffect, useMemo, useState } from "react";

type Approval = {
  id: string;
  requestingAgent: string;
  actionType: string;
  target: { type: string; id: string };
  riskLevel: 1 | 2 | 3 | 4;
  payloadSummary: string;
  status: "pending" | "approved" | "rejected" | "expired";
  requestedAt: string;
  updatedAt: string;
  decidedAt?: string;
  result?: string;
};

type Filter = "all" | Approval["status"];

const statusLabels: Record<Approval["status"], string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/approvals", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { approvals?: Approval[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load approval requests");
        return payload.approvals || [];
      })
      .then((records) => { if (active) setApprovals(records); })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Unable to load approval requests");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visibleApprovals = useMemo(
    () => filter === "all" ? approvals : approvals.filter((approval) => approval.status === filter),
    [approvals, filter],
  );
  const pendingCount = approvals.filter((approval) => approval.status === "pending").length;

  return (
    <main style={{ background: "#0b0b0d" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <p style={{ color: "#b7a67d", letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 12, margin: 0 }}>Governed execution</p>
            <h1 style={{ fontSize: 48, lineHeight: 1, margin: "12px 0" }}>Approvals</h1>
            <p style={{ color: "#aaa7a0", maxWidth: 620, lineHeight: 1.6, margin: 0 }}>Review prepared actions before a specialist agent can publish, send, change, or otherwise execute them.</p>
          </div>
          <div style={{ border: "1px solid #3b3426", borderRadius: 14, padding: "16px 20px", minWidth: 150 }}>
            <div style={{ color: "#aaa7a0", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em" }}>Awaiting review</div>
            <strong style={{ display: "block", fontSize: 32, marginTop: 6 }}>{pendingCount}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, margin: "36px 0 18px", flexWrap: "wrap" }} role="tablist" aria-label="Approval filters">
          {(["all", "pending", "approved", "rejected", "expired"] as Filter[]).map((option) => (
            <button key={option} type="button" role="tab" aria-selected={filter === option} onClick={() => setFilter(option)} style={{ border: filter === option ? "1px solid #b7a67d" : "1px solid #302f33", background: filter === option ? "#28231a" : "transparent", color: "#f5f1e8", borderRadius: 999, padding: "9px 14px", cursor: "pointer", textTransform: "capitalize" }}>
              {option}
            </button>
          ))}
        </div>

        {loading && <p style={{ color: "#aaa7a0" }}>Loading approval requests…</p>}
        {error && <p role="alert" style={{ color: "#ff9d9d", border: "1px solid #6c3030", borderRadius: 12, padding: 16 }}>{error}</p>}
        {!loading && !error && visibleApprovals.length === 0 && <div style={{ border: "1px dashed #3a383e", borderRadius: 16, padding: 40, color: "#aaa7a0" }}>No approval requests match this filter.</div>}
        <div style={{ display: "grid", gap: 14 }}>
          {visibleApprovals.map((approval) => (
            <article key={approval.id} style={{ border: "1px solid #302f33", borderRadius: 16, padding: 22, background: "#111114" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
                <div>
                  <p style={{ color: "#b7a67d", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>{approval.actionType}</p>
                  <h2 style={{ fontSize: 22, margin: "8px 0" }}>{approval.payloadSummary}</h2>
                </div>
                <span style={{ border: "1px solid #4a4438", borderRadius: 999, padding: "7px 11px", color: approval.status === "pending" ? "#f0d391" : "#d7d2c6", fontSize: 12 }}>{statusLabels[approval.status]}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 20, color: "#aaa7a0", fontSize: 13 }}>
                <div><strong style={{ color: "#f5f1e8", display: "block" }}>Requesting agent</strong>{approval.requestingAgent}</div>
                <div><strong style={{ color: "#f5f1e8", display: "block" }}>Target</strong>{approval.target.type}: {approval.target.id}</div>
                <div><strong style={{ color: "#f5f1e8", display: "block" }}>Risk level</strong>{approval.riskLevel} / 4</div>
                <div><strong style={{ color: "#f5f1e8", display: "block" }}>Requested</strong>{formatDate(approval.requestedAt)}</div>
              </div>
              {approval.result && <p style={{ color: "#d7d2c6", borderTop: "1px solid #29282d", paddingTop: 14, margin: "18px 0 0" }}>{approval.result}</p>}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
