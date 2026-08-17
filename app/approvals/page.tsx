"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { requiresExplicitApprovalConfirmation } from "../../lib/approvals/decision";
import {
  decisionConflictMessage,
  decisionConfirmationText,
  decisionSuccessMessage,
  isDecisionAllowed,
  type ApprovalDecisionStatus,
  type ApprovalLifecycleStatus,
} from "../../lib/approvals/decision-ui";

type ApprovalStatus = ApprovalLifecycleStatus;
type ApprovalFilter = ApprovalStatus | "all";
type DecisionStatus = ApprovalDecisionStatus;
type DecisionProgressState = "submitting" | "success" | "conflict" | "error";

type Approval = {
  id: string;
  requestingAgent: string;
  actionType: string;
  target: { type: string; id: string };
  riskLevel: number;
  summary: string;
  status: ApprovalStatus;
  requestedAt: string;
  updatedAt: string;
  decidedAt?: string;
  expiresAt?: string;
  result?: string;
};

type ApprovalListResponse = {
  approvals?: Approval[];
  nextCursor?: string | null;
  error?: string;
};

type ApprovalDetailResponse = {
  approval?: Approval;
  error?: string;
};

type DecisionProgress = {
  approvalId: string;
  state: DecisionProgressState;
  message: string;
};

const statusLabels: Record<ApprovalFilter, string> = {
  all: "All requests",
  pending: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  consumed: "Consumed",
};

const filters: ApprovalFilter[] = ["pending", "approved", "rejected", "expired", "consumed", "all"];

export default function ApprovalsPage() {
  const [token, setToken] = useState("");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [filter, setFilter] = useState<ApprovalFilter>("pending");
  const [message, setMessage] = useState("Enter a signed founder session to load persisted approval state.");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [decisionProgress, setDecisionProgress] = useState<DecisionProgress | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  async function loadApprovals(
    event?: FormEvent,
    requestedFilter: ApprovalFilter = filter,
    cursor?: string,
    append = false,
    preserveSelection = false,
  ) {
    event?.preventDefault();
    const session = token.trim();
    if (!session) {
      setError("A signed founder session is required.");
      setMessage("The queue was not loaded.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(append ? "Loading more approval requests..." : `Loading ${statusLabels[requestedFilter].toLowerCase()}...`);

    try {
      const response = await fetch(buildApprovalListPath(requestedFilter, cursor), {
        method: "GET",
        headers: { Authorization: `Bearer ${session}` },
        cache: "no-store",
      });
      const body = await response.json() as ApprovalListResponse;
      if (!response.ok) throw new Error(body.error ?? "Unable to load approvals");

      const incoming = body.approvals ?? [];
      setApprovals((current) => append ? [...current, ...incoming] : incoming);
      setNextCursor(body.nextCursor ?? null);
      if (!append && !preserveSelection) {
        setSelectedApproval(null);
        setDecisionProgress(null);
      }
      setMessage(`${incoming.length} ${statusLabels[requestedFilter].toLowerCase()} loaded${body.nextCursor ? ". More are available." : "."}`);
    } catch (loadError) {
      const text = loadError instanceof Error ? loadError.message : "Unable to load approvals";
      setError(text);
      setMessage("Approval data could not be loaded.");
      if (!append) setApprovals([]);
    } finally {
      setLoading(false);
    }
  }

  async function changeFilter(status: ApprovalFilter) {
    setFilter(status);
    setNextCursor(null);
    setDecisionProgress(null);
    if (token.trim()) await loadApprovals(undefined, status);
  }

  async function loadDetail(approvalId: string) {
    const session = token.trim();
    if (!session) {
      setError("A signed founder session is required.");
      return;
    }

    setDetailLoading(true);
    setError(null);
    try {
      const approval = await fetchPersistedApproval(approvalId, session);
      setSelectedApproval(approval);
      requestAnimationFrame(() => detailHeadingRef.current?.focus());
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Unable to load approval detail");
    } finally {
      setDetailLoading(false);
    }
  }

  async function decide(approvalId: string, status: DecisionStatus, result: string) {
    const session = token.trim();
    if (!session) {
      const text = "A signed founder session is required before a decision can be submitted.";
      setError(text);
      setDecisionProgress({ approvalId, state: "error", message: text });
      return;
    }
    if (!result.trim()) {
      const text = "Add a short decision note before submitting.";
      setError(text);
      setDecisionProgress({ approvalId, state: "error", message: text });
      return;
    }

    const submittingMessage = status === "approved"
      ? "Submitting approval to the protected server..."
      : "Submitting rejection to the protected server...";
    setDecisionProgress({ approvalId, state: "submitting", message: submittingMessage });
    setMessage(submittingMessage);
    setError(null);

    try {
      const response = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status, result: result.trim() }),
      });
      const body = await response.json() as ApprovalDetailResponse;

      if (response.status === 409) {
        const refreshing = "The protected server blocked this stale decision. Refreshing persisted state...";
        setDecisionProgress({ approvalId, state: "conflict", message: refreshing });
        setMessage(refreshing);

        let latest: Approval | null = null;
        try {
          latest = await fetchPersistedApproval(approvalId, session);
        } catch {
          latest = null;
        }
        await loadApprovals(undefined, filter, undefined, false, true);

        if (latest) {
          const conflictMessage = decisionConflictMessage(latest.status);
          setSelectedApproval(latest);
          setDecisionProgress({ approvalId, state: "conflict", message: conflictMessage });
          setMessage(conflictMessage);
          requestAnimationFrame(() => detailHeadingRef.current?.focus());
        } else {
          const conflictMessage = "No action was taken. The protected server reported a conflict and the queue was refreshed, but the latest request detail could not be loaded.";
          setDecisionProgress({ approvalId, state: "conflict", message: conflictMessage });
          setMessage(conflictMessage);
        }
        return;
      }

      if (!response.ok || !body.approval) {
        throw new Error(body.error ?? "Unable to save decision");
      }

      await loadApprovals(undefined, filter, undefined, false, true);
      setSelectedApproval(body.approval);
      const successMessage = decisionSuccessMessage(status);
      setDecisionProgress({ approvalId, state: "success", message: successMessage });
      setMessage(successMessage);
      requestAnimationFrame(() => detailHeadingRef.current?.focus());
    } catch (decisionError) {
      const reason = decisionError instanceof Error ? decisionError.message : "Unable to save decision";
      const text = `No decision state was assumed because the protected API did not confirm the change. ${reason}`;
      setError(text);
      setDecisionProgress({ approvalId, state: "error", message: text });
      setMessage("Decision was not confirmed by the protected server.");
    }
  }

  return (
    <main className="approval-shell">
      <header className="approval-header">
        <div>
          <p className="eyebrow">Melato OS / Governance</p>
          <h1>Approval queue</h1>
          <p className="lede">Review persisted, protected approval state before governed actions reach external systems.</p>
        </div>
        <div className="header-mark" aria-hidden="true">MG</div>
      </header>

      <section className="access-panel" aria-labelledby="access-heading">
        <div>
          <p className="section-kicker">Founder access</p>
          <h2 id="access-heading">Open the governed queue</h2>
          <p className="muted">The signed founder session stays in memory for this browser view and is sent only to protected approval endpoints.</p>
        </div>
        <form className="access-form" onSubmit={(event) => void loadApprovals(event, filter)}>
          <label htmlFor="approval-token">Founder session token</label>
          <div className="access-row">
            <input
              id="approval-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste signed session"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={loading}>{loading ? "Loading..." : "Load queue"}</button>
          </div>
        </form>
      </section>

      <section className="queue-toolbar" aria-labelledby="queue-heading">
        <div>
          <p className="section-kicker">Decision desk</p>
          <h2 id="queue-heading">Persisted approval state</h2>
        </div>
        <div className="filter-row" aria-label="Filter approvals by lifecycle status">
          {filters.map((status) => (
            <button
              key={status}
              type="button"
              className={filter === status ? "filter active" : "filter"}
              onClick={() => void changeFilter(status)}
              aria-pressed={filter === status}
              disabled={loading}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>
      </section>

      <p className="queue-message" role="status" aria-live="polite">{message}</p>
      {error && <p className="queue-error" role="alert">{error}</p>}

      <div className="approval-layout">
        <section className="approval-list-column" aria-labelledby="queue-heading" aria-busy={loading}>
          {loading && approvals.length === 0 ? (
            <div className="loading-state" role="status">
              <span className="loading-pulse" aria-hidden="true" />
              <p>Loading persisted approval records...</p>
            </div>
          ) : approvals.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon" aria-hidden="true">✓</span>
              <h3>{filter === "pending" ? "The queue is clear" : "No approval requests match this view"}</h3>
              <p>Change the lifecycle filter or refresh after new governed actions are prepared.</p>
            </div>
          ) : (
            <div className="approval-grid">
              {approvals.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  loading={loading}
                  selected={selectedApproval?.id === approval.id}
                  decisionProgress={decisionProgress?.approvalId === approval.id ? decisionProgress : null}
                  onView={loadDetail}
                  onDecide={decide}
                />
              ))}
            </div>
          )}

          {nextCursor && (
            <button
              type="button"
              className="load-more"
              onClick={() => void loadApprovals(undefined, filter, nextCursor, true)}
              disabled={loading}
            >
              {loading ? "Loading..." : "Load more"}
            </button>
          )}
        </section>

        <aside className="approval-detail" aria-label="Approval detail" aria-busy={detailLoading}>
          {detailLoading ? (
            <div className="detail-placeholder" role="status">Loading approval detail...</div>
          ) : selectedApproval ? (
            <ApprovalDetail approval={selectedApproval} headingRef={detailHeadingRef} onClose={() => setSelectedApproval(null)} />
          ) : (
            <div className="detail-placeholder">
              <p className="section-kicker">Request detail</p>
              <h2>Select a request</h2>
              <p>Open a persisted approval to inspect its safe summary, target, lifecycle timestamps, and decision result.</p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function ApprovalCard({
  approval,
  loading,
  selected,
  decisionProgress,
  onView,
  onDecide,
}: {
  approval: Approval;
  loading: boolean;
  selected: boolean;
  decisionProgress: DecisionProgress | null;
  onView: (id: string) => Promise<void>;
  onDecide: (id: string, status: DecisionStatus, result: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<DecisionStatus | null>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const decisionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const isPending = isDecisionAllowed(approval.status);
  const decisionBusy = decisionProgress?.state === "submitting";

  useEffect(() => {
    if (confirming) requestAnimationFrame(() => confirmationRef.current?.focus());
  }, [confirming]);

  function requestDecision(status: DecisionStatus, trigger: HTMLButtonElement) {
    decisionTriggerRef.current = trigger;
    if (requiresExplicitApprovalConfirmation(approval.riskLevel)) {
      setConfirming(status);
      return;
    }
    void onDecide(approval.id, status, note);
  }

  function closeConfirmation() {
    setConfirming(null);
    requestAnimationFrame(() => decisionTriggerRef.current?.focus());
  }

  return (
    <article className={`approval-card ${isPending ? "pending" : "resolved"}${selected ? " selected" : ""}`}>
      <div className="card-topline">
        <span className={`status-badge ${approval.status}`}>{statusLabels[approval.status]}</span>
        <span className="risk-badge">Risk {approval.riskLevel}</span>
      </div>
      <h3>{formatAction(approval.actionType)}</h3>
      <p className="payload">{approval.summary}</p>
      <dl className="approval-meta">
        <div><dt>Requested by</dt><dd>{approval.requestingAgent}</dd></div>
        <div><dt>Target</dt><dd>{approval.target.type} / {approval.target.id}</dd></div>
        <div><dt>Requested</dt><dd><time dateTime={approval.requestedAt}>{formatDate(approval.requestedAt)}</time></dd></div>
      </dl>
      <button
        type="button"
        className="view-detail"
        onClick={() => void onView(approval.id)}
        aria-expanded={selected}
        aria-controls="approval-detail-panel"
      >
        {selected ? "Detail open" : "View persisted detail"}
      </button>

      {approval.result && <p className="decision-note"><strong>Decision note:</strong> {approval.result}</p>}
      {decisionProgress && (
        <p
          className={`decision-state ${decisionProgress.state}`}
          role={decisionProgress.state === "error" || decisionProgress.state === "conflict" ? "alert" : "status"}
          aria-live="polite"
        >
          {decisionProgress.message}
        </p>
      )}

      {isPending ? (
        <div className="decision-panel">
          <label htmlFor={`note-${approval.id}`}>Decision note</label>
          <textarea
            id={`note-${approval.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why is this decision appropriate?"
            rows={2}
            disabled={decisionBusy}
          />
          <div className="decision-actions">
            <button
              type="button"
              className="reject"
              disabled={loading || decisionBusy}
              onClick={(event) => requestDecision("rejected", event.currentTarget)}
            >
              {decisionBusy ? "Submitting..." : "Reject"}
            </button>
            <button
              type="button"
              className="approve"
              disabled={loading || decisionBusy}
              onClick={(event) => requestDecision("approved", event.currentTarget)}
            >
              {decisionBusy ? "Submitting..." : "Approve action"}
            </button>
          </div>
          {confirming && (
            <div
              ref={confirmationRef}
              className="confirmation-panel"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={`confirm-${approval.id}`}
              aria-describedby={`confirm-copy-${approval.id}`}
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeConfirmation();
                }
              }}
            >
              <p className="confirmation-title" id={`confirm-${approval.id}`}>
                {decisionConfirmationText(approval, confirming)}
              </p>
              <p className="confirmation-copy" id={`confirm-copy-${approval.id}`}>
                Risk {approval.riskLevel} requires explicit confirmation. The protected server remains authoritative, and no UI state will change unless it accepts this decision.
              </p>
              <div className="decision-actions">
                <button type="button" className="reject" disabled={decisionBusy} onClick={closeConfirmation}>Cancel</button>
                <button
                  type="button"
                  className={confirming === "approved" ? "approve" : "reject"}
                  disabled={decisionBusy}
                  onClick={() => {
                    const decision = confirming;
                    setConfirming(null);
                    void onDecide(approval.id, decision, note);
                  }}
                >
                  {confirming === "approved" ? "Confirm approval" : "Confirm rejection"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="terminal-decision-note">
          Decision controls are unavailable because persisted state is {statusLabels[approval.status].toLowerCase()}.
        </p>
      )}
    </article>
  );
}

function ApprovalDetail({
  approval,
  headingRef,
  onClose,
}: {
  approval: Approval;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}) {
  return (
    <div id="approval-detail-panel">
      <div className="detail-topline">
        <div>
          <p className="section-kicker">Persisted request</p>
          <span className={`status-badge ${approval.status}`}>{statusLabels[approval.status]}</span>
        </div>
        <button type="button" className="detail-close" onClick={onClose} aria-label="Close approval detail">Close</button>
      </div>
      <h2 ref={headingRef} tabIndex={-1}>{formatAction(approval.actionType)}</h2>
      <p className="detail-summary">{approval.summary}</p>
      <dl className="detail-meta">
        <DetailRow label="Request ID" value={approval.id} />
        <DetailRow label="Requester" value={approval.requestingAgent} />
        <DetailRow label="Target" value={`${approval.target.type} / ${approval.target.id}`} />
        <DetailRow label="Risk" value={`Risk ${approval.riskLevel}`} />
        <DetailRow label="Requested" value={formatDate(approval.requestedAt)} />
        <DetailRow label="Updated" value={formatDate(approval.updatedAt)} />
        {approval.expiresAt && <DetailRow label="Expires" value={formatDate(approval.expiresAt)} />}
        {approval.decidedAt && <DetailRow label="Decided" value={formatDate(approval.decidedAt)} />}
        {approval.result && <DetailRow label="Decision result" value={approval.result} />}
      </dl>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

async function fetchPersistedApproval(approvalId: string, session: string): Promise<Approval> {
  const response = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${session}` },
    cache: "no-store",
  });
  const body = await response.json() as ApprovalDetailResponse;
  if (!response.ok || !body.approval) throw new Error(body.error ?? "Unable to load approval detail");
  return body.approval;
}

function buildApprovalListPath(filter: ApprovalFilter, cursor?: string) {
  const parameters = new URLSearchParams();
  parameters.set("limit", "25");
  if (filter !== "all") parameters.set("status", filter);
  if (cursor) parameters.set("cursor", cursor);
  return `/api/approvals?${parameters.toString()}`;
}

function formatAction(action: string) {
  return action.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
