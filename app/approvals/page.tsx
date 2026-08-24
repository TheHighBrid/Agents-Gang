"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
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

type SignInResponse = {
  token?: string;
  expiresAt?: number;
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
  const [accessSecret, setAccessSecret] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [filter, setFilter] = useState<ApprovalFilter>("pending");
  const [message, setMessage] = useState("Enter your founder access secret to load persisted approval state.");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [decisionProgress, setDecisionProgress] = useState<DecisionProgress | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  const loadApprovals = useCallback(async (
    requestedFilter: ApprovalFilter,
    cursor?: string,
    append = false,
    preserveSelection = false,
  ) => {
    if (!sessionToken) {
      setLoading(false);
      setMessage("Sign in to load persisted approval state.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(append ? "Loading more approval requests..." : `Loading ${statusLabels[requestedFilter].toLowerCase()}...`);

    try {
      const response = await fetch(buildApprovalListPath(requestedFilter, cursor), {
        method: "GET",
        headers: { Authorization: `Bearer ${sessionToken}` },
        cache: "no-store",
      });
      const body = await response.json() as ApprovalListResponse;
      if (response.status === 401 || response.status === 403) {
        setSessionToken("");
        throw new Error("Founder session expired or was rejected. Sign in again.");
      }
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
  }, [sessionToken]);

  useEffect(() => {
    if (sessionToken) void loadApprovals("pending");
  }, [sessionToken, loadApprovals]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    const suppliedAccessSecret = accessSecret.trim();
    if (!suppliedAccessSecret) {
      setError("Founder access secret is required.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage("Signing in...");
    setAccessSecret("");

    try {
      const response = await fetch("/api/founder/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessSecret: suppliedAccessSecret }),
        cache: "no-store",
      });
      const body = await response.json() as SignInResponse;
      if (!response.ok || !body.token) {
        setSessionToken("");
        throw new Error(response.status === 401 ? "Founder access was denied." : body.error ?? "Founder sign-in is unavailable.");
      }
      setSessionToken(body.token);
      setMessage("Founder session established. Loading approvals...");
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Founder sign-in is unavailable.");
      setMessage("Approval data could not be loaded.");
      setLoading(false);
    }
  }

  async function changeFilter(status: ApprovalFilter) {
    setFilter(status);
    setNextCursor(null);
    setDecisionProgress(null);
    await loadApprovals(status);
  }

  async function loadDetail(approvalId: string) {
    if (!sessionToken) return;
    setDetailLoading(true);
    setError(null);
    try {
      const approval = await fetchPersistedApproval(approvalId, sessionToken);
      setSelectedApproval(approval);
      requestAnimationFrame(() => detailHeadingRef.current?.focus());
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Unable to load approval detail");
    } finally {
      setDetailLoading(false);
    }
  }

  async function decide(approvalId: string, status: DecisionStatus, result: string) {
    if (!sessionToken) {
      setError("Founder session is required.");
      return;
    }
    if (!result.trim()) {
      const text = "Add a short decision note before submitting.";
      setError(text);
      setDecisionProgress({ approvalId, state: "error", message: text });
      return;
    }

    const submittingMessage = status === "approved" ? "Submitting approval to the server..." : "Submitting rejection to the server...";
    setDecisionProgress({ approvalId, state: "submitting", message: submittingMessage });
    setMessage(submittingMessage);
    setError(null);

    try {
      const response = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ status, result: result.trim() }),
      });
      const body = await response.json() as ApprovalDetailResponse;

      if (response.status === 401 || response.status === 403) {
        setSessionToken("");
        throw new Error("Founder session expired or was rejected. Sign in again.");
      }

      if (response.status === 409) {
        const refreshing = "The server blocked this stale decision. Refreshing persisted state...";
        setDecisionProgress({ approvalId, state: "conflict", message: refreshing });
        setMessage(refreshing);

        let latest: Approval | null = null;
        try {
          latest = await fetchPersistedApproval(approvalId, sessionToken);
        } catch {
          latest = null;
        }
        await loadApprovals(filter, undefined, false, true);

        if (latest) {
          const conflictMessage = decisionConflictMessage(latest.status);
          setSelectedApproval(latest);
          setDecisionProgress({ approvalId, state: "conflict", message: conflictMessage });
          setMessage(conflictMessage);
          requestAnimationFrame(() => detailHeadingRef.current?.focus());
        } else {
          const conflictMessage = "No action was taken. The server reported a conflict and the queue was refreshed, but the latest request detail could not be loaded.";
          setDecisionProgress({ approvalId, state: "conflict", message: conflictMessage });
          setMessage(conflictMessage);
        }
        return;
      }

      if (!response.ok || !body.approval) throw new Error(body.error ?? "Unable to save decision");

      await loadApprovals(filter, undefined, false, true);
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
      setMessage("Decision was not confirmed by the server.");
    }
  }

  return (
    <main className="approval-shell">
      <header className="approval-header">
        <div>
          <p className="eyebrow">Melato OS / Governance</p>
          <h1>Approval queue</h1>
          <p className="lede">Review persisted approval state before governed actions reach external systems.</p>
        </div>
        <div className="header-mark" aria-hidden="true">MG</div>
      </header>

      <section className="access-panel" aria-labelledby="founder-access-heading">
        <div>
          <p className="section-kicker">Founder access</p>
          <h2 id="founder-access-heading">Load persisted approval state</h2>
          <p className="muted">For staging UAT, enter the Founder access secret. It is exchanged server-side for a short-lived session and is not stored in browser storage.</p>
        </div>
        <form className="access-form" onSubmit={signIn}>
          <label htmlFor="founder-access-secret">Founder access secret</label>
          <div className="access-row">
            <input
              id="founder-access-secret"
              type="password"
              value={accessSecret}
              onChange={(event) => setAccessSecret(event.target.value)}
              placeholder={sessionToken ? "Founder session active in this tab" : "Enter founder access secret"}
              autoComplete="current-password"
              spellCheck={false}
              disabled={loading || Boolean(sessionToken)}
            />
            <button type="submit" disabled={loading || Boolean(sessionToken)}>
              {loading ? "Loading..." : "Sign in and load approvals"}
            </button>
            {sessionToken && <button type="button" onClick={() => void loadApprovals(filter)} disabled={loading}>{loading ? "Loading..." : "Refresh queue"}</button>}
          </div>
        </form>
      </section>

      <section className="queue-toolbar" aria-labelledby="queue-heading">
        <div><p className="section-kicker">Decision desk</p><h2 id="queue-heading">Persisted approval state</h2></div>
        <div className="filter-row" aria-label="Filter approvals by lifecycle status">
          {filters.map((status) => (
            <button key={status} type="button" className={filter === status ? "filter active" : "filter"} onClick={() => void changeFilter(status)} aria-pressed={filter === status} disabled={loading || !sessionToken}>{statusLabels[status]}</button>
          ))}
        </div>
      </section>

      <p className="queue-message" role="status" aria-live="polite">{message}</p>
      {error && <p className="queue-error" role="alert">{error}</p>}

      <div className="approval-layout">
        <section className="approval-list-column" aria-labelledby="queue-heading" aria-busy={loading}>
          {loading && approvals.length === 0 ? (
            <div className="loading-state" role="status"><span className="loading-pulse" aria-hidden="true" /><p>Loading persisted approval records...</p></div>
          ) : approvals.length === 0 ? (
            <div className="empty-state"><span className="empty-icon" aria-hidden="true">✓</span><h3>{filter === "pending" ? "The queue is clear" : "No approval requests match this view"}</h3><p>{sessionToken ? "Change the lifecycle filter or refresh after new governed actions are prepared." : "Sign in above to inspect protected approval state."}</p></div>
          ) : (
            <div className="approval-grid">
              {approvals.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} loading={loading} selected={selectedApproval?.id === approval.id} decisionProgress={decisionProgress?.approvalId === approval.id ? decisionProgress : null} onView={loadDetail} onDecide={decide} />
              ))}
            </div>
          )}

          {nextCursor && <button type="button" className="load-more" onClick={() => void loadApprovals(filter, nextCursor, true)} disabled={loading}>{loading ? "Loading..." : "Load more"}</button>}
        </section>

        <aside className="approval-detail" aria-label="Approval detail" aria-busy={detailLoading}>
          {detailLoading ? <div className="detail-placeholder" role="status">Loading approval detail...</div> : selectedApproval ? (
            <ApprovalDetail approval={selectedApproval} headingRef={detailHeadingRef} onClose={() => setSelectedApproval(null)} />
          ) : (
            <div className="detail-placeholder"><p className="section-kicker">Request detail</p><h2>Select a request</h2><p>Open a persisted approval to inspect its safe summary, target, lifecycle timestamps, and decision result.</p></div>
          )}
        </aside>
      </div>
    </main>
  );
}

function ApprovalCard({ approval, loading, selected, decisionProgress, onView, onDecide }: {
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
      <div className="card-topline"><span className={`status-badge ${approval.status}`}>{statusLabels[approval.status]}</span><span className="risk-badge">Risk {approval.riskLevel}</span></div>
      <h3>{formatAction(approval.actionType)}</h3>
      <p className="payload">{approval.summary}</p>
      <dl className="approval-meta">
        <div><dt>Requested by</dt><dd>{approval.requestingAgent}</dd></div>
        <div><dt>Target</dt><dd>{approval.target.type} / {approval.target.id}</dd></div>
        <div><dt>Requested</dt><dd><time dateTime={approval.requestedAt}>{formatDate(approval.requestedAt)}</time></dd></div>
      </dl>
      <button type="button" className="view-detail" onClick={() => void onView(approval.id)} aria-expanded={selected} aria-controls="approval-detail-panel">{selected ? "Detail open" : "View persisted detail"}</button>

      {approval.result && <p className="decision-note"><strong>Decision note:</strong> {approval.result}</p>}
      {decisionProgress && <p className={`decision-state ${decisionProgress.state}`} role={decisionProgress.state === "error" || decisionProgress.state === "conflict" ? "alert" : "status"} aria-live="polite">{decisionProgress.message}</p>}

      {isPending ? (
        <div className="decision-panel">
          <label htmlFor={`note-${approval.id}`}>Decision note</label>
          <textarea id={`note-${approval.id}`} value={note} onChange={(event) => setNote(event.target.value)} disabled={loading || decisionBusy} maxLength={2_000} />
          <div className="decision-actions">
            <button type="button" ref={(element) => { if (element) decisionTriggerRef.current = element; }} onClick={(event) => requestDecision("approved", event.currentTarget)} disabled={loading || decisionBusy}>Approve</button>
            <button type="button" onClick={(event) => requestDecision("rejected", event.currentTarget)} disabled={loading || decisionBusy}>Reject</button>
          </div>
        </div>
      ) : <p className="terminal-decision-note">Decision controls are unavailable because persisted state is {statusLabels[approval.status].toLowerCase()}.</p>}

      {confirming && (
        <div className="decision-confirmation" role="alertdialog" aria-modal="true" tabIndex={-1} ref={confirmationRef} onKeyDown={(event) => { if (event.key === "Escape") closeConfirmation(); }}>
          <p>{decisionConfirmationText(approval, confirming)}</p>
          <div className="decision-actions">
            <button type="button" onClick={() => { const status = confirming; setConfirming(null); void onDecide(approval.id, status, note); }}>Confirm {confirming === "approved" ? "approval" : "rejection"}</button>
            <button type="button" onClick={closeConfirmation}>Cancel</button>
          </div>
        </div>
      )}
    </article>
  );
}

function ApprovalDetail({ approval, headingRef, onClose }: { approval: Approval; headingRef: React.RefObject<HTMLHeadingElement | null>; onClose: () => void }) {
  return (
    <div id="approval-detail-panel">
      <button type="button" className="detail-close" onClick={onClose}>Close</button>
      <p className="section-kicker">Persisted request</p>
      <h2 ref={headingRef} tabIndex={-1}>{formatAction(approval.actionType)}</h2>
      <p>{approval.summary}</p>
      <dl className="approval-meta">
        <div><dt>Status</dt><dd>{statusLabels[approval.status]}</dd></div>
        <div><dt>Risk</dt><dd>{approval.riskLevel}</dd></div>
        <div><dt>Agent</dt><dd>{approval.requestingAgent}</dd></div>
        <div><dt>Target</dt><dd>{approval.target.type} / {approval.target.id}</dd></div>
        <div><dt>Updated</dt><dd>{formatDate(approval.updatedAt)}</dd></div>
      </dl>
    </div>
  );
}

function buildApprovalListPath(filter: ApprovalFilter, cursor?: string) {
  const parameters = new URLSearchParams();
  if (filter !== "all") parameters.set("status", filter);
  if (cursor) parameters.set("cursor", cursor);
  const query = parameters.toString();
  return `/api/approvals?${query}`;
}

async function fetchPersistedApproval(approvalId: string, sessionToken: string) {
  const response = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${sessionToken}` },
    cache: "no-store",
  });
  const body = await response.json() as ApprovalDetailResponse;
  if (!response.ok || !body.approval) throw new Error(body.error ?? "Unable to load approval detail");
  return body.approval;
}

function formatAction(value: string) {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
