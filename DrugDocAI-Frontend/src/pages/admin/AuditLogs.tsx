import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  UploadCloud,
  Database,
  User,
  AlertTriangle,
  Trash2,
  ShieldCheck,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";
import { adminFetch } from "../../auth/adminApi";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const ITEMS_PER_PAGE = 10;

export type AuditStatus = "Success" | "Warning" | "Error";

export interface BackendAuditEntry {
  timestamp: number;
  event_type: string;
  details: string;
  ip: string | null;
  user: string | null;
  resource: string | null;
  status: string | null;
  previous_hash: string;
  hash: string;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  details: string;
  status: AuditStatus;
  ipAddress: string;
}

const getActionIcon = (action: string) => {
  switch (action) {
    case "Document Processed":
    case "Query Answered":
      return <FileText size={16} className="al-action-icon al-action-icon--blue" />;

    case "File Uploaded":
    case "Document Viewed":
    case "Document Downloaded":
      return <UploadCloud size={16} className="al-action-icon al-action-icon--teal" />;

    case "Document Indexed":
      return <Database size={16} className="al-action-icon al-action-icon--teal" />;

    case "Login":
      return <User size={16} className="al-action-icon al-action-icon--blue" />;

    case "Processing Failed":
    case "Generation Failed":
    case "Injection Blocked":
    case "Unauthorized Access":
      return <AlertTriangle size={16} className="al-action-icon al-action-icon--red" />;

    case "Document Deleted":
    case "Session Erasure":
      return <Trash2 size={16} className="al-action-icon al-action-icon--orange" />;

    case "Integrity Check":
    case "System Init":
    case "AUDIT VERIFIED":
      return <ShieldCheck size={16} className="al-action-icon al-action-icon--blue" />;

    case "User Role Updated":
      return <UserCheck size={16} className="al-action-icon al-action-icon--blue" />;

    case "Verification Failed":
    case "Escalated to Human":
      return <AlertCircle size={16} className="al-action-icon al-action-icon--red" />;

    default:
      return <Info size={16} className="al-action-icon al-action-icon--gray" />;
  }
};

const mapBackendEntry = (entry: BackendAuditEntry): AuditLogRecord => {
  const id = entry.hash ? entry.hash.slice(0, 10) : `al-${Math.random()}`;

  let formattedTimestamp = "—";

  if (entry.timestamp) {
    const d = new Date(entry.timestamp * 1000);

    formattedTimestamp =
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
      });
  }

  const user = entry.ip ? `IP: ${entry.ip}` : "system";

  let action = entry.event_type;

  if (action === "INGESTION_ACCEPTED") action = "Document Processed";
  else if (action === "INGESTION_REJECTED" || action === "INGESTION_FAILED") {
    action = "Processing Failed";
  } else if (action === "DOCUMENT_UPLOAD_REQUESTED") {
    action = "File Uploaded";
  } else if (action === "DOCUMENT_VIEWED") {
    action = "Document Viewed";
  } else if (action === "DOCUMENT_DOWNLOADED") {
    action = "Document Downloaded";
  } else if (action === "DOCUMENT_DELETED") {
    action = "Document Deleted";
  } else if (action === "QUERY_ANSWERED") {
    action = "Query Answered";
  } else if (action === "ESCALATED_TO_HUMAN") {
    action = "Escalated to Human";
  } else if (action === "GENERATION_FAILED") {
    action = "Generation Failed";
  } else if (action === "INJECTION_BLOCKED") {
    action = "Injection Blocked";
  } else if (action === "UNAUTHORIZED_FILE_ACCESS") {
    action = "Unauthorized Access";
  } else if (action === "SESSION_ERASURE_REQUESTED") {
    action = "Session Erasure";
  } else if (action === "SYSTEM_INIT") {
    action = "System Init";
  } else if (action === "AUDIT_VERIFIED") {
    action = "AUDIT VERIFIED";
  } else {
    action = action.replace(/_/g, " ");
  }

  let resource = "—";
  const details = entry.details || "";

  const fileMatch = details.match(/(?:file|filename|attempted_file)=([^\s:]+)/i);
  const sessionMatch = details.match(/(?:session)=([^\s:]+)/i);

  if (fileMatch?.[1]) {
    resource = fileMatch[1];
  } else if (sessionMatch?.[1]) {
    resource =
      sessionMatch[1].length > 12
        ? `${sessionMatch[1].slice(0, 12)}…`
        : sessionMatch[1];
  }

  let status: AuditStatus = "Success";
  const backendStatus = entry.status?.toUpperCase() ?? "";
  const eventType = entry.event_type.toUpperCase();

  // Prefer the backend's explicit status when available.
  if (
    backendStatus === "FAILED" ||
    backendStatus === "ERROR" ||
    backendStatus === "FAILURE"
  ) {
    status = "Error";
  } else if (
    backendStatus === "WARNING" ||
    backendStatus === "WARN"
  ) {
    status = "Warning";
  } else if (
    eventType.includes("FAILED") ||
    eventType.includes("REJECTED") ||
    eventType.includes("BLOCKED") ||
    eventType.includes("UNAUTHORIZED") ||
    eventType.includes("ERROR")
  ) {
    status = "Error";
  } else if (
    eventType.includes("DELETED") ||
    eventType.includes("ESCALATED") ||
    eventType.includes("ERASURE") ||
    eventType.includes("WARNING")
  ) {
    status = "Warning";
  }

  return {
    id,
    timestamp: formattedTimestamp,
    user,
    action,
    resource,
    details: entry.details,
    status,
    ipAddress: entry.ip || "127.0.0.1",
  };
};

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [integrityStatus, setIntegrityStatus] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);

  const [verifyingIntegrity, setVerifyingIntegrity] = useState(false);

  const [dateRange, setDateRange] = useState<string>("");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [currentPage, setCurrentPage] = useState<number>(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await adminFetch(`${API_BASE}/audit/logs?limit=500`);

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(
            "Admin authentication required. Please sign in with an admin key."
          );
        }

        throw new Error(`Failed to fetch audit logs (HTTP ${res.status})`);
      }

      const data = await res.json();
      const entries: BackendAuditEntry[] = data.entries || [];

      setLogs(entries.map(mapBackendEntry));
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching audit logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyIntegrity = useCallback(async () => {
    setVerifyingIntegrity(true);
    setIntegrityStatus(null);

    try {
      const res = await adminFetch(`${API_BASE}/audit/verify`);

      if (!res.ok) {
        throw new Error(`Integrity verification failed (HTTP ${res.status})`);
      }

      const data = await res.json();

      setIntegrityStatus({
        valid: data.valid,
        message: data.message,
      });
    } catch (err: any) {
      setIntegrityStatus({
        valid: false,
        message: err.message || "Integrity verification failed.",
      });
    } finally {
      setVerifyingIntegrity(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const availableUsers = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => set.add(log.user));
    return Array.from(set);
  }, [logs]);

  const availableActions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => set.add(log.action));
    return Array.from(set);
  }, [logs]);

  const availableResources = useMemo(() => {
    const set = new Set<string>();

    logs.forEach((log) => {
      if (log.resource !== "—") {
        set.add(log.resource);
      }
    });

    return Array.from(set);
  }, [logs]);

  const availableStatuses: AuditStatus[] = ["Success", "Warning", "Error"];

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (userFilter !== "all" && log.user !== userFilter) return false;
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (resourceFilter !== "all" && log.resource !== resourceFilter) return false;
      if (statusFilter !== "all" && log.status !== statusFilter) return false;

      if (dateRange) {
        const logDate = new Date(log.timestamp).toISOString().slice(0, 10);

        if (logDate !== dateRange) {
          return false;
        }
      }

      return true;
    });
  }, [
    logs,
    userFilter,
    actionFilter,
    resourceFilter,
    statusFilter,
    dateRange,
  ]);

  const handleFilterChange = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string
  ) => {
    setter(value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setDateRange("");
    setUserFilter("all");
    setActionFilter("all");
    setResourceFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  const isFiltered =
    userFilter !== "all" ||
    actionFilter !== "all" ||
    resourceFilter !== "all" ||
    statusFilter !== "all" ||
    dateRange !== "";

  const totalEvents = logs.length;

  const successCount = useMemo(
    () => logs.filter((log) => log.status === "Success").length,
    [logs]
  );

  const warningCount = useMemo(
    () => logs.filter((log) => log.status === "Warning").length,
    [logs]
  );

  const errorCount = useMemo(
    () => logs.filter((log) => log.status === "Error").length,
    [logs]
  );

  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;

  const paginatedLogs = filteredLogs.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  return (
    <AdminLayout title="Audit Logs">
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          className="al-export-btn"
          title="Verify Audit Log Integrity"
          onClick={verifyIntegrity}
          disabled={verifyingIntegrity}
        >
          {verifyingIntegrity ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <ShieldCheck size={15} />
          )}
          {verifyingIntegrity ? "Verifying..." : "Verify Integrity"}
        </button>

        <button
          type="button"
          className="al-export-btn"
          title="Refresh Audit Logs"
          onClick={fetchLogs}
        >
          <RefreshCw size={15} />
          Refresh Logs
        </button>
      </div>

      {integrityStatus && (
        <div
          className="admin-card"
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {integrityStatus.valid ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertTriangle size={18} />
          )}

          <span>
            <strong>
              {integrityStatus.valid
                ? "Audit integrity verified"
                : "Integrity check failed"}
            </strong>
            {" — "}
            {integrityStatus.message}
          </span>
        </div>
      )}

      <div className="admin-card al-filter-card">
        <div className="al-filters-grid">
          <div className="al-filter-group">
            <div className="al-date-input-wrap">
              <Calendar size={15} className="al-date-icon" />
              <input
                type="date"
                className="al-date-input"
                value={dateRange}
                onChange={(event) => { setDateRange(event.target.value); setCurrentPage(1); }}
                aria-label="Filter by date"
              />
            </div>
          </div>

          <div className="al-filter-group">
            <label className="al-filter-label">User</label>
            <select
              className="admin-select al-filter-select"
              value={userFilter}
              onChange={(event) =>
                handleFilterChange(setUserFilter, event.target.value)
              }
            >
              <option value="all">All Users</option>
              {availableUsers.map((user) => (
                <option key={user} value={user}>
                  {user}
                </option>
              ))}
            </select>
          </div>

          <div className="al-filter-group">
            <label className="al-filter-label">Action Type</label>
            <select
              className="admin-select al-filter-select"
              value={actionFilter}
              onChange={(event) =>
                handleFilterChange(setActionFilter, event.target.value)
              }
            >
              <option value="all">All Actions</option>
              {availableActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          <div className="al-filter-group">
            <label className="al-filter-label">Resource</label>
            <select
              className="admin-select al-filter-select"
              value={resourceFilter}
              onChange={(event) =>
                handleFilterChange(setResourceFilter, event.target.value)
              }
            >
              <option value="all">All Resources</option>
              {availableResources.map((resource) => (
                <option key={resource} value={resource}>
                  {resource}
                </option>
              ))}
            </select>
          </div>

          <div className="al-filter-group">
            <label className="al-filter-label">Status</label>
            <select
              className="admin-select al-filter-select"
              value={statusFilter}
              onChange={(event) =>
                handleFilterChange(setStatusFilter, event.target.value)
              }
            >
              <option value="all">All Statuses</option>
              {availableStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="al-clear-btn"
            onClick={handleClearFilters}
            disabled={!isFiltered}
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="al-summary-row">
        <div className="admin-card al-summary-card">
          <div className="al-summary-icon al-summary-icon--blue">
            <FileText size={20} />
          </div>
          <div className="al-summary-info">
            <span className="al-summary-num">{totalEvents}</span>
            <span className="al-summary-label">Total Events</span>
          </div>
        </div>

        <div className="admin-card al-summary-card">
          <div className="al-summary-icon al-summary-icon--green">
            <CheckCircle2 size={20} />
          </div>
          <div className="al-summary-info">
            <span className="al-summary-num">{successCount}</span>
            <span className="al-summary-label">Successful Actions</span>
          </div>
        </div>

        <div className="admin-card al-summary-card">
          <div className="al-summary-icon al-summary-icon--orange">
            <AlertCircle size={20} />
          </div>
          <div className="al-summary-info">
            <span className="al-summary-num">{warningCount}</span>
            <span className="al-summary-label">Warnings</span>
          </div>
        </div>

        <div className="admin-card al-summary-card">
          <div className="al-summary-icon al-summary-icon--red">
            <AlertTriangle size={20} />
          </div>
          <div className="al-summary-info">
            <span className="al-summary-num">{errorCount}</span>
            <span className="al-summary-label">Errors</span>
          </div>
        </div>
      </div>

      <div className="admin-card al-table-card">
        <div className="admin-table-wrap">
          <table className="admin-table al-table">
            <thead>
              <tr>
                <th style={{ width: "200px" }}>
                  <div className="al-th-cell">Timestamp</div>
                </th>
                <th style={{ width: "110px" }}>
                  <div className="al-th-cell">User</div>
                </th>
                <th style={{ width: "160px" }}>
                  <div className="al-th-cell">Action</div>
                </th>
                <th style={{ width: "180px" }}>
                  <div className="al-th-cell">Resource</div>
                </th>
                <th>
                  <div className="al-th-cell">Details</div>
                </th>
                <th style={{ width: "100px" }}>
                  <div className="al-th-cell">Status</div>
                </th>
                <th style={{ width: "120px" }}>
                  <div className="al-th-cell">IP Address</div>
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="al-empty" style={{ padding: "40px 0" }}>
                      <Loader2 size={24} className="al-empty-icon spin" />
                      <p className="al-empty-text">Loading audit logs...</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7}>
                    <div className="al-empty" style={{ padding: "40px 0" }}>
                      <AlertCircle
                        size={28}
                        className="al-empty-icon"
                        style={{ color: "#ef4444" }}
                      />
                      <p
                        className="al-empty-text"
                        style={{ color: "#ef4444" }}
                      >
                        {error}
                      </p>
                      <button
                        type="button"
                        className="al-clear-btn"
                        onClick={fetchLogs}
                        style={{ marginTop: "12px" }}
                      >
                        <RefreshCw size={14} style={{ marginRight: "6px" }} />
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : paginatedLogs.length > 0 ? (
                paginatedLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div className="al-timestamp-cell">
                        {getActionIcon(log.action)}
                        <span className="al-timestamp-text">
                          {log.timestamp}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className="al-user-cell">{log.user}</span>
                    </td>

                    <td>
                      <span className="al-action-cell">{log.action}</span>
                    </td>

                    <td>
                      <span className="al-resource-cell">
                        {log.resource}
                      </span>
                    </td>

                    <td>
                      <span className="al-details-cell">{log.details}</span>
                    </td>

                    <td>
                      <span
                        className={`al-status-badge al-status-badge--${log.status.toLowerCase()}`}
                      >
                        {log.status}
                      </span>
                    </td>

                    <td>
                      <span className="al-ip-cell">{log.ipAddress}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className="al-empty">
                      <Info size={28} className="al-empty-icon" />
                      <p className="al-empty-text">No audit logs found</p>
                      <p className="al-empty-sub">
                        Try adjusting your filters or clear them.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="al-pagination">
          <span className="al-pagination-info">
            Showing{" "}
            {totalItems > 0 ? startIndex + 1 : 0}–
            {Math.min(startIndex + ITEMS_PER_PAGE, totalItems)} of{" "}
            {totalItems} events
          </span>

          <div className="al-pagination-controls">
            <button
              type="button"
              className="al-page-btn"
              onClick={() =>
                setCurrentPage((page) => Math.max(1, page - 1))
              }
              disabled={currentPage === 1}
              aria-label="Previous Page"
            >
              <ChevronLeft size={14} />
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (page) => (
                <button
                  key={page}
                  type="button"
                  className={`al-page-btn ${currentPage === page ? "al-page-btn--active" : ""
                    }`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              )
            )}

            <button
              type="button"
              className="al-page-btn"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={currentPage === totalPages}
              aria-label="Next Page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};