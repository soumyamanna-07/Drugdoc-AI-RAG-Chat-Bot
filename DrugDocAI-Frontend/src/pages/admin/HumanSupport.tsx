import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Edit3,
  Clock,
  RefreshCw,
  Loader2,
  AlertCircle,
  MessageSquare,
  HelpCircle,
  FileText,
  UserCheck,
} from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";
import { adminFetch } from "../../auth/adminApi";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export interface PendingReview {
  id: string;
  timestamp: number;
  query: string;
  mode: string;
  reason: string;
  status: string;
  reviewer_notes?: string | null;
  final_answer?: string | null;
}

export const HumanSupport: React.FC = () => {
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Selected item detail state
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(null);

  // Resolution action state
  const [actionNotes, setActionNotes] = useState<string>("");
  const [finalAnswer, setFinalAnswer] = useState<string>("");
  const [activeAction, setActiveAction] = useState<"APPROVE" | "REJECT" | "EDITED" | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch pending reviews queue
  const fetchPendingReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`${API_BASE}/review/pending`);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("Admin authentication required. Please sign in with an admin key.");
        }
        throw new Error(`Failed to fetch review queue (HTTP ${res.status})`);
      }
      const data: PendingReview[] = await res.json();
      setReviews(data);

      // Keep selection if it exists in new data, else clear or select first
      setSelectedReview((prev) => {
        if (!prev) return data.length > 0 ? data[0] : null;
        const updated = data.find((r) => r.id === prev.id);
        return updated || (data.length > 0 ? data[0] : null);
      });
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching the review queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingReviews();
  }, [fetchPendingReviews]);

  // Reset resolution form when selected review changes
  useEffect(() => {
    setActionNotes("");
    setFinalAnswer("");
    setActiveAction(null);
    setActionError(null);
  }, [selectedReview?.id]);

  // Handle resolution POST request
  const handleResolve = async (action: "APPROVE" | "REJECT" | "EDITED") => {
    if (!selectedReview) return;
    setActionError(null);
    setSubmitting(true);

    try {
      const payload: { action: string; notes: string; answer?: string } = {
        action,
        notes: actionNotes,
      };

      if (action === "EDITED") {
        if (!finalAnswer.trim()) {
          setActionError("Final answer is required when editing.");
          setSubmitting(false);
          return;
        }
        payload.answer = finalAnswer;
      }

      const res = await adminFetch(`${API_BASE}/review/${selectedReview.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("Admin authentication required. Please sign in again.");
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to resolve review (HTTP ${res.status})`);
      }

      // Success - reset form & refresh queue
      setActiveAction(null);
      setActionNotes("");
      setFinalAnswer("");
      await fetchPendingReviews();
    } catch (err: any) {
      setActionError(err.message || "An error occurred while submitting resolution.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimestamp = (ts: number) => {
    if (!ts) return "—";
    const d = new Date(ts * 1000);
    return (
      d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      " " +
      d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })
    );
  };

  return (
    <AdminLayout title="Human Support">
      {/* Header */}
      <div className="al-page-header">
        <div>
          <p className="al-subtitle">
            Review and resolve clinical queries flagged or escalated by automated safety gates.
          </p>
        </div>
        <button
          type="button"
          className="al-export-btn"
          title="Refresh Queue"
          onClick={fetchPendingReviews}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? "spin" : ""} />
          Refresh Queue
        </button>
      </div>

      {/* Main Grid: Queue Table/List & Review Panel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", alignItems: "start" }}>
        {/* Left Side: Pending Queue */}
        <div className="admin-card al-table-card">
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color, #e2e8f0)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--text-color, #0f172a)", display: "flex", alignItems: "center", gap: "8px" }}>
              <ShieldAlert size={18} style={{ color: "#f59e0b" }} />
              Pending Escalations ({reviews.length})
            </h3>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table al-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Timestamp</th>
                  <th>Mode</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="al-empty" style={{ padding: "40px 0" }}>
                        <Loader2 size={24} className="al-empty-icon spin" />
                        <p className="al-empty-text">Loading review queue...</p>
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="al-empty" style={{ padding: "40px 0" }}>
                        <AlertCircle size={28} className="al-empty-icon" style={{ color: "#ef4444" }} />
                        <p className="al-empty-text" style={{ color: "#ef4444" }}>{error}</p>
                        <button type="button" className="al-clear-btn" onClick={fetchPendingReviews} style={{ marginTop: "12px" }}>
                          <RefreshCw size={14} style={{ marginRight: "6px" }} /> Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : reviews.length > 0 ? (
                  reviews.map((rev) => {
                    const isSelected = selectedReview?.id === rev.id;
                    return (
                      <tr
                        key={rev.id}
                        onClick={() => setSelectedReview(rev)}
                        style={{
                          cursor: "pointer",
                          backgroundColor: isSelected ? "rgba(59, 130, 246, 0.08)" : undefined,
                        }}
                      >
                        <td>
                          <span className="al-action-cell" style={{ fontFamily: "monospace", fontSize: "12px" }}>
                            {rev.id.slice(0, 8)}…
                          </span>
                        </td>
                        <td>
                          <span className="al-timestamp-text" style={{ fontSize: "12px" }}>
                            {formatTimestamp(rev.timestamp)}
                          </span>
                        </td>
                        <td>
                          <span className="al-user-cell" style={{ textTransform: "capitalize" }}>
                            {rev.mode}
                          </span>
                        </td>
                        <td>
                          <span className="al-details-cell" title={rev.reason}>
                            {rev.reason}
                          </span>
                        </td>
                        <td>
                          <span className="al-status-badge al-status-badge--warning">
                            {rev.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <div className="al-empty" style={{ padding: "40px 0" }}>
                        <UserCheck size={32} className="al-empty-icon" style={{ color: "#10b981" }} />
                        <p className="al-empty-text">Queue is clear</p>
                        <p className="al-empty-sub">No pending support or safety reviews at this time.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Detailed Review & Resolution Action */}
        <div className="admin-card" style={{ padding: "20px" }}>
          {selectedReview ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>REQUEST ID</span>
                  <h3 style={{ margin: "2px 0 0 0", fontFamily: "monospace", fontSize: "14px", color: "#0f172a" }}>
                    {selectedReview.id}
                  </h3>
                </div>
                <span className="al-status-badge al-status-badge--warning">
                  {selectedReview.status}
                </span>
              </div>

              {/* Details Breakdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "20px" }}>
                <div>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={13} /> Timestamp
                  </span>
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#1e293b" }}>
                    {formatTimestamp(selectedReview.timestamp)}
                  </p>
                </div>

                <div>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                    <HelpCircle size={13} /> Target Audience / Mode
                  </span>
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#1e293b", textTransform: "capitalize" }}>
                    {selectedReview.mode}
                  </p>
                </div>

                <div>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                    <AlertCircle size={13} /> Escalation Reason
                  </span>
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#dc2626", fontWeight: 500 }}>
                    {selectedReview.reason}
                  </p>
                </div>

                <div>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                    <MessageSquare size={13} /> Redacted User Query
                  </span>
                  <div style={{ marginTop: "6px", padding: "12px", borderRadius: "6px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "13px", color: "#0f172a", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {selectedReview.query}
                  </div>
                </div>
              </div>

              {/* Actions Section */}
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                  Review Resolution Actions
                </h4>

                {actionError && (
                  <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "6px", backgroundColor: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <AlertCircle size={16} />
                    {actionError}
                  </div>
                )}

                {/* Reviewer Notes Input */}
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                    Reviewer Notes (Optional for Approve/Reject, recommended)
                  </label>
                  <textarea
                    rows={2}
                    className="admin-select"
                    style={{ width: "100%", padding: "8px 12px", fontSize: "13px", resize: "vertical", boxSizing: "border-box" }}
                    placeholder="Add clinical context or verification notes..."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                {/* Final Answer Input (Shown when Edit action is active) */}
                {activeAction === "EDITED" && (
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                      Final Approved Answer (Required for Edit)
                    </label>
                    <textarea
                      rows={4}
                      className="admin-select"
                      style={{ width: "100%", padding: "8px 12px", fontSize: "13px", resize: "vertical", boxSizing: "border-box" }}
                      placeholder="Provide the verified clinical answer to resolve this request..."
                      value={finalAnswer}
                      onChange={(e) => setFinalAnswer(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                )}

                {/* Buttons */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                  {activeAction === "EDITED" ? (
                    <>
                      <button
                        type="button"
                        className="al-export-btn"
                        style={{ backgroundColor: "#2563eb", color: "#ffffff", border: "none" }}
                        onClick={() => handleResolve("EDITED")}
                        disabled={submitting}
                      >
                        {submitting ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                        Confirm & Submit Edit
                      </button>
                      <button
                        type="button"
                        className="al-clear-btn"
                        onClick={() => setActiveAction(null)}
                        disabled={submitting}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="al-export-btn"
                        style={{ backgroundColor: "#16a34a", color: "#ffffff", border: "none" }}
                        onClick={() => handleResolve("APPROVE")}
                        disabled={submitting}
                      >
                        {submitting ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                        Approve
                      </button>

                      <button
                        type="button"
                        className="al-export-btn"
                        style={{ backgroundColor: "#dc2626", color: "#ffffff", border: "none" }}
                        onClick={() => handleResolve("REJECT")}
                        disabled={submitting}
                      >
                        {submitting ? <Loader2 size={15} className="spin" /> : <XCircle size={15} />}
                        Reject
                      </button>

                      <button
                        type="button"
                        className="al-export-btn"
                        style={{ backgroundColor: "#d97706", color: "#ffffff", border: "none" }}
                        onClick={() => setActiveAction("EDITED")}
                        disabled={submitting}
                      >
                        <Edit3 size={15} />
                        Edit & Provide Answer
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="al-empty" style={{ padding: "60px 0" }}>
              <FileText size={32} className="al-empty-icon" />
              <p className="al-empty-text">No review selected</p>
              <p className="al-empty-sub">Select an item from the pending escalations queue to review details and take action.</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};
