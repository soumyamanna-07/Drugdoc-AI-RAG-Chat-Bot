import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileText,
  UploadCloud,
  Database,
  User,
  ShieldCheck,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { adminFetch } from "../../auth/adminApi";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

// localStorage key for the hash of the newest audit event the admin has seen.
const SEEN_KEY = "drugdoc_notif_last_seen_hash";

// ── Notification Data ─────────────────────────────────────────────────────────
export interface NotificationItem {
  id: string;          // backend hash (first 10 chars)
  hash: string;        // full backend hash — used as the stable identity marker
  timestamp: string;   // formatted display string
  rawTimestamp: number; // epoch seconds from backend — used for ordering
  action: string;
  resource: string;
  details: string;
  status: "Success" | "Warning" | "Error";
}

// ── Backend shape (same as AuditLogs.tsx) ─────────────────────────────────────
interface BackendAuditEntry {
  timestamp: number;
  event_type: string;
  details: string;
  ip: string | null;
  user?: string | null;
  resource?: string | null;
  status?: string | null;
  previous_hash: string;
  hash: string;
}

// ── Mapping helpers ───────────────────────────────────────────────────────────
type AuditStatus = "Success" | "Warning" | "Error";

const mapStatus = (eventType: string): AuditStatus => {
  const ev = eventType.toUpperCase();
  if (
    ev.includes("FAILED") ||
    ev.includes("REJECTED") ||
    ev.includes("BLOCKED") ||
    ev.includes("UNAUTHORIZED") ||
    ev.includes("ERROR")
  )
    return "Error";
  if (
    ev.includes("DELETED") ||
    ev.includes("ESCALATED") ||
    ev.includes("ERASURE") ||
    ev.includes("WARNING")
  )
    return "Warning";
  return "Success";
};

const mapAction = (eventType: string): string => {
  switch (eventType) {
    case "INGESTION_ACCEPTED":       return "Document Processed";
    case "INGESTION_REJECTED":
    case "INGESTION_FAILED":         return "Processing Failed";
    case "DOCUMENT_VIEWED":          return "Document Viewed";
    case "DOCUMENT_DOWNLOADED":      return "Document Downloaded";
    case "DOCUMENT_DELETED":         return "Document Deleted";
    case "QUERY_ANSWERED":           return "Query Answered";
    case "ESCALATED_TO_HUMAN":       return "Escalated to Human";
    case "GENERATION_FAILED":        return "Generation Failed";
    case "INJECTION_BLOCKED":        return "Injection Blocked";
    case "UNAUTHORIZED_FILE_ACCESS": return "Unauthorized Access";
    case "SESSION_ERASURE_REQUESTED":return "Session Erasure";
    case "SYSTEM_INIT":              return "System Init";
    case "ADMIN_AUTH_SUCCESS":       return "Login";
    default:                         return eventType.replace(/_/g, " ");
  }
};

const extractResource = (details: string): string => {
  const fileMatch = details.match(/(?:file|filename|attempted_file)=([^\s:]+)/i);
  const sessionMatch = details.match(/(?:session)=([^\s:]+)/i);
  if (fileMatch?.[1]) return fileMatch[1];
  if (sessionMatch?.[1])
    return sessionMatch[1].length > 12 ? sessionMatch[1].slice(0, 12) + "…" : sessionMatch[1];
  return "—";
};

const formatTimestamp = (epoch: number): string => {
  const d = new Date(epoch * 1000);
  return (
    d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) +
    ", " +
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  );
};

const mapEntry = (entry: BackendAuditEntry): NotificationItem => ({
  id: entry.hash ? entry.hash.slice(0, 10) : `n-${Math.random()}`,
  hash: entry.hash,
  rawTimestamp: entry.timestamp,
  timestamp: formatTimestamp(entry.timestamp),
  action: mapAction(entry.event_type),
  resource: extractResource(entry.details || ""),
  details: entry.details || "",
  status: mapStatus(entry.event_type),
});

// ── Icon helper ───────────────────────────────────────────────────────────────
const getNotificationIcon = (action: string, status: string) => {
  if (status === "Error") {
    return <AlertCircle size={15} className="admin-notif-item-icon admin-notif-item-icon--error" />;
  }
  if (status === "Warning") {
    return <AlertTriangle size={15} className="admin-notif-item-icon admin-notif-item-icon--warning" />;
  }
  switch (action) {
    case "Document Processed":
    case "Query Answered":
      return <CheckCircle2 size={15} className="admin-notif-item-icon admin-notif-item-icon--success" />;
    case "File Uploaded":
    case "Document Downloaded":
      return <UploadCloud size={15} className="admin-notif-item-icon admin-notif-item-icon--teal" />;
    case "Document Indexed":
      return <Database size={15} className="admin-notif-item-icon admin-notif-item-icon--teal" />;
    case "Login":
      return <User size={15} className="admin-notif-item-icon admin-notif-item-icon--blue" />;
    default:
      return <ShieldCheck size={15} className="admin-notif-item-icon admin-notif-item-icon--teal" />;
  }
};

// ── Persistent seen-marker helpers ────────────────────────────────────────────
const getLastSeenHash = (): string | null => localStorage.getItem(SEEN_KEY);
const setLastSeenHash = (hash: string): void => localStorage.setItem(SEEN_KEY, hash);

// ── Component ─────────────────────────────────────────────────────────────────
export const NotificationDropdown: React.FC = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch the 5 newest audit events from the real backend.
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`${API_BASE}/audit/logs?limit=5`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const entries: BackendAuditEntry[] = data.entries || [];
      const mapped = entries.map(mapEntry);
      setNotifications(mapped);

      // Determine unread state: compare newest event hash against persisted marker.
      if (mapped.length > 0) {
        const newestHash = mapped[0].hash;
        setHasUnread(newestHash !== getLastSeenHash());
      } else {
        setHasUnread(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load notifications");
      setNotifications([]);
      setHasUnread(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount.
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Close dropdown on click outside.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const toggleDropdown = () => {
    if (!isOpen) {
      setIsOpen(true);
      // Mark the newest event as seen — persists across reloads.
      if (notifications.length > 0) {
        setLastSeenHash(notifications[0].hash);
        setHasUnread(false);
      }
    } else {
      setIsOpen(false);
    }
  };

  const handleShowMore = () => {
    setIsOpen(false);
    navigate("/admin/audit");
  };

  return (
    <div className="admin-notif-wrap" ref={containerRef}>
      <button
        type="button"
        className={`admin-notif-btn${isOpen ? " admin-notif-btn--active" : ""}`}
        onClick={toggleDropdown}
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell size={18} />
        {hasUnread && <span className="admin-notif-dot" aria-hidden="true" />}
      </button>

      {isOpen && (
        <div className="admin-notif-dropdown" role="dialog" aria-label="Notifications dropdown">
          {/* Header */}
          <div className="admin-notif-header">
            <span className="admin-notif-title">Audit Notifications</span>
            <span className="admin-notif-badge">
              {notifications.length} recent
            </span>
          </div>

          {/* List */}
          <div className="admin-notif-list">
            {loading && (
              <div className="admin-notif-empty">
                <Loader2 size={20} className="admin-notif-spinner" />
                <span>Loading…</span>
              </div>
            )}

            {!loading && error && (
              <div className="admin-notif-empty">
                <AlertCircle size={18} className="admin-notif-item-icon admin-notif-item-icon--error" />
                <span>Unable to load notifications</span>
              </div>
            )}

            {!loading && !error && notifications.length === 0 && (
              <div className="admin-notif-empty">
                <FileText size={18} />
                <span>No audit events yet</span>
              </div>
            )}

            {!loading &&
              !error &&
              notifications.map((item) => (
                <div key={item.id} className="admin-notif-item">
                  <div className="admin-notif-item-left">
                    {getNotificationIcon(item.action, item.status)}
                  </div>
                  <div className="admin-notif-item-body">
                    <div className="admin-notif-item-header">
                      <span className="admin-notif-item-action">{item.action}</span>
                      <span className="admin-notif-item-time">{item.timestamp}</span>
                    </div>
                    <p className="admin-notif-item-details">
                      {item.resource !== "—" ? `${item.resource} • ` : ""}
                      {item.details}
                    </p>
                  </div>
                </div>
              ))}
          </div>

          {/* Footer */}
          <div className="admin-notif-footer">
            <button type="button" className="admin-notif-more-btn" onClick={handleShowMore}>
              <span>Show More</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
