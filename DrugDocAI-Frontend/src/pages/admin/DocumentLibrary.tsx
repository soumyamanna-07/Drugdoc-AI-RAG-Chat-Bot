import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  UploadCloud,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  FileSpreadsheet,
  FileType2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";
import {
  type DocumentRecord,
  type DocStatus,
  type FileType,
} from "../../data/adminData";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
import { adminFetch } from "../../auth/adminApi";
const PAGE_SIZE = 10;

// Helper to strip 8-char hex/uuid storage prefix (e.g., 94d34749_Python.pdf -> Python.pdf)
const getDisplayFileName = (item: any, index: number): string => {
  if (item.filename) return item.filename;
  if (item.file_name) return item.file_name;
  if (item.source_file) {
    // If source_file has a prefix like "80e55c78_filename.ext", strip it for display
    const parts = item.source_file.split("_");
    if (parts.length > 1 && (parts[0].length === 8 || parts[0].length === 36)) {
      return parts.slice(1).join("_");
    }
    return item.source_file;
  }
  return `document_${index + 1}.pdf`;
};

// Helper to determine file type from filename extension
const getFileType = (fileName: string): FileType => {
  const ext = fileName.split(".").pop()?.toUpperCase() || "";
  if (ext === "XLSX" || ext === "XLS") return "XLSX";
  if (ext === "DOCX" || ext === "DOC") return "DOCX";
  if (ext === "XML") return "XML";
  return "PDF";
};

// Helper to format date strings like "20100115" or ISO strings into readable "15 Jan 2010"
const formatDate = (dateStr?: string): string => {
  if (!dateStr || dateStr === "unknown") return "Ingested";
  // Check if YYYYMMDD format (8 digits)
  if (/^\d{8}$/.test(dateStr)) {
    const year = dateStr.substring(0, 4);
    const monthIdx = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = parseInt(dateStr.substring(6, 8), 10);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${day} ${months[monthIdx]} ${year}`;
    }
  }
  // If ISO date string or similar, parse with Date
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${parsed.getDate()} ${months[parsed.getMonth()]} ${parsed.getFullYear()}`;
  }
  return dateStr;
};

// Map raw backend item to DocumentRecord shape
const mapBackendRecord = (item: any, index: number, defaultDrug?: string): DocumentRecord => {
  const canonicalId = item.source_file || item.id || item.filename || item.file_name || item.chunk_id || `doc-${index}`;
  const fileName = getDisplayFileName(item, index);
  const drug = item.drug_name || defaultDrug || "General / Unspecified";
  const source = item.source_type && item.source_type !== "unknown" ? item.source_type : "Uploaded";
  
  const rawVersion = item.label_version || item.version;
  const version = rawVersion && rawVersion !== "unknown" ? rawVersion : "Not specified";

  const fileType = getFileType(canonicalId);

  let uploadedOn = "Ingested";
  if (item.effective_date && item.effective_date !== "unknown") {
    uploadedOn = formatDate(item.effective_date);
  } else if (item.ingestion_timestamp && item.ingestion_timestamp !== "unknown") {
    uploadedOn = formatDate(item.ingestion_timestamp);
  } else if (item.page !== undefined && item.page !== null) {
    uploadedOn = `Page ${item.page}`;
  }

  return {
    id: canonicalId,
    fileName,
    drug,
    source,
    fileType,
    version,
    uploadedOn,
    status: "Processed",
    fileUrl: item.file_url || item.url || item.blob_url,
    fileBlob: item.blob || item.file_blob,
  };
};

// ── File type icon ─────────────────────────────────────────────────────────────
const FileIcon: React.FC<{ type: FileType }> = ({ type }) => {
  if (type === "XLSX") return <FileSpreadsheet size={15} className="dl-file-icon dl-file-icon--xlsx" />;
  if (type === "DOCX") return <FileType2 size={15} className="dl-file-icon dl-file-icon--docx" />;
  if (type === "XML") return <FileType2 size={15} className="dl-file-icon dl-file-icon--xml" />;
  return <FileText size={15} className="dl-file-icon dl-file-icon--pdf" />;
};

// ── Status badge ───────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: DocStatus }> = ({ status }) => (
  <span className={`admin-status-badge admin-status-badge--${status.toLowerCase()}`}>
    {status}
  </span>
);

// ── Pagination ─────────────────────────────────────────────────────────────────
interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onChange: (p: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ total, page, pageSize, onChange }) => {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  // Build page window: always show first/last + up to 3 around current
  const pages: (number | "…")[] = [];
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

  if (totalPages <= 7) {
    pages.push(...range(1, totalPages));
  } else {
    pages.push(...range(1, Math.min(2, totalPages)));
    if (page > 4) pages.push("…");
    const mid = range(Math.max(3, page - 1), Math.min(totalPages - 2, page + 1));
    pages.push(...mid);
    if (page < totalPages - 3) pages.push("…");
    pages.push(...range(Math.max(totalPages - 1, 3), totalPages));
  }

  return (
    <div className="dl-pagination">
      <span className="dl-pagination-info">
        Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total} documents
      </span>
      <div className="dl-pagination-controls">
        <button
          className="dl-page-btn"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>

        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="dl-page-ellipsis">…</span>
          ) : (
            <button
              key={p}
              className={`dl-page-btn dl-page-btn--num${p === page ? " dl-page-btn--active" : ""}`}
              onClick={() => onChange(p as number)}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}

        <button
          className="dl-page-btn"
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

// ── Select dropdown ────────────────────────────────────────────────────────────
interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}

const FilterSelect: React.FC<FilterSelectProps> = ({ id, label, value, options, onChange }) => (
  <div className="dl-filter-group">
    <label className="dl-filter-label" htmlFor={id}>{label}</label>
    <select id={id} className="dl-filter-select" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">All {label}s</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

// ── Document Library Page ──────────────────────────────────────────────────────
export const DocumentLibrary: React.FC = () => {
  const navigate = useNavigate();

  // Backend state
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state for delete confirmation
  const [docToDelete, setDocToDelete] = useState<DocumentRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Filter state
  const [search, setSearch] = useState("");
  const [filterSource, setSource] = useState("");
  const [filterDrug, setDrug] = useState("");
  const [filterType, setType] = useState<FileType | "">("");
  const [filterStatus, setStatus] = useState<DocStatus | "">("");
  const [page, setPage] = useState(1);

  // Fetch document-level metadata from the protected backend endpoint.
  const fetchSources = useCallback(async (selectedDrug?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: "1", page_size: "100" });
      if (selectedDrug?.trim()) params.set("drug", selectedDrug.trim());
      const res = await adminFetch(`${API_BASE}/documents?${params.toString()}`);
      if (!res.ok) {
        let errText = `Failed to fetch documents (HTTP ${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson && errJson.detail) {
            errText = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
          }
        } catch {
          // fallback
        }
        throw new Error(errText);
      }
      const data = await res.json();
      if (!data || !Array.isArray(data.items)) {
        throw new Error("Invalid response format received from server.");
      }
      const mapped = data.items.map((item: any, idx: number) => mapBackendRecord(item, idx, selectedDrug));
      setDocuments(mapped);
    } catch (err: any) {
      setError(err.message || "An error occurred while loading document sources.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Derived filter options from fetched documents
  const docSources = useMemo(() => [...new Set(documents.map(d => d.source))].sort(), [documents]);
  const docDrugs = useMemo(() => [...new Set(documents.map(d => d.drug))].sort(), [documents]);
  const docFileTypes: FileType[] = ["PDF", "XML", "XLSX", "DOCX"];
  const docStatuses: DocStatus[] = ["Processed"];

  const hasFilters = search || filterSource || filterDrug || filterType || filterStatus;

  const clearFilters = () => {
    setSearch("");
    setSource("");
    setType("");
    setStatus("");
    setPage(1);
    if (filterDrug) {
      setDrug("");
      fetchSources();
    }
  };

  // Filtered & paginated data
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter(doc => {
      if (q && !doc.fileName.toLowerCase().includes(q) && !doc.drug.toLowerCase().includes(q) && !doc.source.toLowerCase().includes(q)) return false;
      if (filterSource && doc.source !== filterSource) return false;
      if (filterDrug && doc.drug.toLowerCase() !== filterDrug.toLowerCase()) return false;
      if (filterType && doc.fileType !== filterType) return false;
      if (filterStatus && doc.status !== filterStatus) return false;
      return true;
    });
  }, [documents, search, filterSource, filterDrug, filterType, filterStatus]);

  // Filter change handlers
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleSource = (v: string) => { setSource(v); setPage(1); };
  const handleType = (v: string) => { setType(v as FileType | ""); setPage(1); };
  const handleStatus = (v: string) => { setStatus(v as DocStatus | ""); setPage(1); };

  // Backend-aware Drug filter handler
  const handleDrug = (selected: string) => {
    setDrug(selected);
    setPage(1);
    fetchSources(selected);
  };

  // Handle View Document action
  const handleViewDocument = async (doc: DocumentRecord) => {
    if (doc.fileType !== "PDF" && doc.fileType !== "XML") {
      alert(`Inline preview is only supported for PDF and XML documents. "${doc.fileName}" is a ${doc.fileType} file.`);
      return;
    }
    
    try {
      const viewUrl = doc.fileUrl || `${API_BASE}/documents/${encodeURIComponent(doc.id)}/view`;
      const res = await adminFetch(viewUrl);
      if (!res.ok) throw new Error(`Failed to fetch document (HTTP ${res.status})`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      alert(err.message || "An error occurred while fetching the document.");
    }
  };

  // Handle Download Document action
  const handleDownloadDocument = async (doc: DocumentRecord) => {
    if (doc.fileBlob instanceof Blob) {
      const blobUrl = URL.createObjectURL(doc.fileBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = doc.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      return;
    }

    try {
      const downloadUrl = doc.fileUrl || `${API_BASE}/documents/${encodeURIComponent(doc.id)}/download`;
      const res = await adminFetch(downloadUrl);
      if (!res.ok) throw new Error(`Failed to download document (HTTP ${res.status})`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = doc.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      alert(err.message || "An error occurred while downloading the document.");
    }
  };

  // Handle Delete Confirmation
  const handleDeleteClick = (doc: DocumentRecord) => {
    setDocToDelete(doc);
    setDeleteError(null);
  };

  const cancelDelete = () => {
    if (isDeleting) return;
    setDocToDelete(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;
    const documentId = docToDelete.id;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await adminFetch(`${API_BASE}/documents/${encodeURIComponent(documentId)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        let errDetail = `Delete failed (HTTP ${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson && errJson.detail) {
            errDetail = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
          }
        } catch {
          // fallback
        }
        throw new Error(errDetail);
      }

      // Backend confirmed deletion — remove from local UI state
      setDocuments(prev => prev.filter(d => d.id !== documentId));
      setDocToDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete document from server.");
    } finally {
      setIsDeleting(false);
    }
  };

  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  // Dynamic KPI summary from real documents
  const total = documents.length;
  const processed = documents.filter(d => d.status === "Processed").length;
  const processing = documents.filter(d => d.status === "Processing").length;
  const errors = documents.filter(d => d.status === "Error").length;

  return (
    <AdminLayout title="Document Library">
      {/* ── Page header row ── */}
      <div className="dl-page-header">
        <p className="dl-page-subtitle">
          Browse, search and manage all uploaded medical and drug-related documents.
        </p>
        <button
          className="dl-upload-btn"
          type="button"
          onClick={() => navigate("/admin/upload")}
        >
          <UploadCloud size={16} />
          Upload Document
        </button>
      </div>

      {/* ── Search + Filters ── */}
      <div className="admin-card dl-filters-card">
        <div className="dl-search-wrap">
          <Search size={15} className="dl-search-icon" />
          <input
            id="dl-search"
            type="text"
            className="dl-search-input"
            placeholder="Search documents, drugs, or keywords…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            aria-label="Search documents"
          />
          {search && (
            <button className="dl-search-clear" onClick={() => handleSearch("")} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="dl-filters-row">
          <FilterSelect id="dl-source" label="Source" value={filterSource} options={docSources} onChange={handleSource} />
          <FilterSelect id="dl-drug" label="Drug" value={filterDrug} options={docDrugs} onChange={handleDrug} />
          <FilterSelect id="dl-type" label="File Type" value={filterType} options={docFileTypes} onChange={handleType} />
          <FilterSelect id="dl-status" label="Status" value={filterStatus} options={docStatuses} onChange={handleStatus} />

          {hasFilters && (
            <button className="dl-clear-btn" type="button" onClick={clearFilters}>
              <X size={13} />
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="admin-kpi-row dl-kpi-row">
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon admin-kpi-icon--blue"><FileText size={20} /></div>
          <div className="admin-kpi-info">
            <div className="admin-kpi-value">{total}</div>
            <div className="admin-kpi-label">Total Documents</div>
          </div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon admin-kpi-icon--teal"><CheckCircle2 size={20} /></div>
          <div className="admin-kpi-info">
            <div className="admin-kpi-value">{processed}</div>
            <div className="admin-kpi-label">Processed</div>
          </div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon admin-kpi-icon--orange"><Clock size={20} /></div>
          <div className="admin-kpi-info">
            <div className="admin-kpi-value">{processing}</div>
            <div className="admin-kpi-label">Processing</div>
          </div>
        </div>
        <div className="admin-kpi-card admin-kpi-card--error">
          <div className="admin-kpi-icon admin-kpi-icon--red"><AlertTriangle size={20} /></div>
          <div className="admin-kpi-info">
            <div className="admin-kpi-value admin-kpi-value--error">{errors}</div>
            <div className="admin-kpi-label">Processing Errors</div>
          </div>
        </div>
      </div>

      {/* ── Document Table ── */}
      <div className="admin-card dl-table-card">
        {loading ? (
          <div className="dl-empty" style={{ padding: "40px 20px" }}>
            <Loader2 size={32} className="up-spin" style={{ color: "#3b82f6", marginBottom: "12px" }} />
            <p className="dl-empty-text">Loading document library from server...</p>
          </div>
        ) : error ? (
          <div className="dl-empty" style={{ padding: "40px 20px" }}>
            <AlertTriangle size={32} style={{ color: "#ef4444", marginBottom: "12px" }} />
            <p className="dl-empty-text" style={{ color: "#ef4444" }}>{error}</p>
            <button
              className="dl-clear-btn"
              type="button"
              onClick={() => fetchSources(filterDrug)}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "12px" }}
            >
              <RefreshCw size={14} /> Retry Loading
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="dl-empty">
            <Search size={30} className="dl-empty-icon" />
            <p className="dl-empty-text">
              {documents.length === 0
                ? "No ingested documents found in the database."
                : "No documents match your current filters."}
            </p>
            {hasFilters && (
              <button className="dl-clear-btn" type="button" onClick={clearFilters}>
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="dl-table-wrap">
              <table className="admin-table dl-table" aria-label="Document library">
                <thead>
                  <tr>
                    <th className="dl-th-check">
                      <input type="checkbox" aria-label="Select all" className="dl-checkbox" />
                    </th>
                    <th>File Name</th>
                    <th>Drug / Topic</th>
                    <th>Source <span className="dl-sort-arrow">↕</span></th>
                    <th>File Type <span className="dl-sort-arrow">↕</span></th>
                    <th>Version <span className="dl-sort-arrow">↕</span></th>
                    <th>Uploaded On / Details <span className="dl-sort-arrow">↕</span></th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(doc => (
                    <tr key={doc.id}>
                      <td className="dl-td-check">
                        <input type="checkbox" aria-label={`Select ${doc.fileName}`} className="dl-checkbox" />
                      </td>
                      <td>
                        <span className="dl-filename">
                          <FileIcon type={doc.fileType} />
                          {doc.fileName}
                        </span>
                      </td>
                      <td className="dl-drug-cell">{doc.drug}</td>
                      <td>{doc.source}</td>
                      <td>
                        <span className={`dl-filetype-badge dl-filetype-badge--${doc.fileType.toLowerCase()}`}>
                          {doc.fileType}
                        </span>
                      </td>
                      <td className="dl-version-cell">{doc.version}</td>
                      <td className="admin-table-date">{doc.uploadedOn}</td>
                      <td><StatusBadge status={doc.status} /></td>
                      <td>
                        <div className="dl-actions-cell">
                          <button
                            className="dl-action-btn"
                            title="View document"
                            aria-label={`View ${doc.fileName}`}
                            onClick={() => handleViewDocument(doc)}
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            className="dl-action-btn"
                            title="Download document"
                            aria-label={`Download ${doc.fileName}`}
                            onClick={() => handleDownloadDocument(doc)}
                          >
                            <Download size={15} />
                          </button>
                          <button
                            className="dl-action-btn dl-action-btn--delete"
                            title="Delete document"
                            aria-label={`Delete ${doc.fileName}`}
                            onClick={() => handleDeleteClick(doc)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              total={filtered.length}
              page={page}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {docToDelete && (
        <div className="dl-modal-overlay" onClick={cancelDelete}>
          <div className="dl-modal-card" onClick={e => e.stopPropagation()}>
            <div className="dl-modal-header">
              <div className="dl-modal-icon-wrap">
                <Trash2 size={22} />
              </div>
              <div className="dl-modal-title-area">
                <h3 className="dl-modal-title">Delete this document permanently?</h3>
                <p className="dl-modal-description">
                  This action cannot be undone. The document and its associated data will be permanently deleted.
                </p>
              </div>
            </div>
            <div className="dl-modal-actions">
              {deleteError && (
                <p style={{ color: "#ef4444", fontSize: "12.5px", margin: "0 0 12px 0", width: "100%" }}>
                  {deleteError}
                </p>
              )}
              <button
                type="button"
                className="dl-modal-btn dl-modal-btn--cancel"
                onClick={cancelDelete}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dl-modal-btn dl-modal-btn--delete"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

