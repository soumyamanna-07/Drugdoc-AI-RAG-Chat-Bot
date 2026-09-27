import React, { useState, useRef, useCallback, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  UploadCloud,
  FileText,
  X,
  RefreshCw,
  Check,
  AlertCircle,
  Clock,
  ChevronRight,
  Layers,
  Search,
  FileCode2,
  Image,
  Info,
  Loader2,
  FileScan,
  Database,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";
import { adminFetch } from "../../auth/adminApi";
const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:8000";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type StageStatus = "pending" | "processing" | "complete" | "failed";

interface PipelineStage {
  id: string;
  label: string;
  step: number;
  icon: React.ReactNode;
}

interface ProcessingDetail {
  text: string;
  done: boolean;
}

// Backend job shape from GET /ingest/{job_id}/status
interface IngestJob {
  job_id: string;
  filename: string;
  drug_name: string;
  stage: "QUEUED" | "PARSING" | "SCANNING" | "EMBEDDING" | "STORED" | "REJECTED" | "FAILED";
  detail: string;
  chunks_found: number | null;
  chunks_stored: number | null;
  error: string | null;
}

// A job still being tracked across a page reload — just enough to resume
// polling without needing the original File object (which reload destroys).
interface TrackedJob {
  jobId: string;
  fileName: string;
}
const STORAGE_KEY = "dip_ingest_active_jobs";

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline stage definitions (static, UI-only)
// ─────────────────────────────────────────────────────────────────────────────
const PIPELINE_STAGES: PipelineStage[] = [
  { id: "upload",   step: 1, label: "Upload",     icon: <UploadCloud size={20} /> },
  { id: "validate", step: 2, label: "Validate",   icon: <Check       size={20} /> },
  { id: "detect",   step: 3, label: "Detect",     icon: <Search      size={20} /> },
  { id: "parse",    step: 4, label: "Parse / OCR",icon: <FileScan    size={20} /> },
  { id: "index",    step: 5, label: "Index",      icon: <Database    size={20} /> },
  { id: "ready",    step: 6, label: "Ready",      icon: <CheckCircle2 size={20}/> },
];

// Stage durations in ms (purely cosmetic simulation) — unused now that
// progress comes from real polling, kept only in case it's needed elsewhere.
const STAGE_DURATIONS_MS = [800, 700, 600, 1200, 900, 500];

// Helper to format bytes
const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Maps a real backend ingest stage onto the six cosmetic UI stages.
const stagesForBackendStage = (
  stage: IngestJob["stage"],
): Record<string, StageStatus> => {
  switch (stage) {
    case "QUEUED":
      return { upload: "complete", validate: "processing", detect: "pending", parse: "pending", index: "pending", ready: "pending" };
    case "PARSING":
      return { upload: "complete", validate: "complete", detect: "complete", parse: "processing", index: "pending", ready: "pending" };
    case "SCANNING":
      return { upload: "complete", validate: "complete", detect: "complete", parse: "complete", index: "processing", ready: "pending" };
    case "EMBEDDING":
      return { upload: "complete", validate: "complete", detect: "complete", parse: "complete", index: "processing", ready: "pending" };
    case "STORED":
      return { upload: "complete", validate: "complete", detect: "complete", parse: "complete", index: "complete", ready: "complete" };
    case "REJECTED":
    case "FAILED":
      return { upload: "complete", validate: "failed", detect: "failed", parse: "failed", index: "failed", ready: "failed" };
    default:
      return { upload: "pending", validate: "pending", detect: "pending", parse: "pending", index: "pending", ready: "pending" };
  }
};

const TERMINAL_STAGES = new Set(["STORED", "REJECTED", "FAILED"]);

// Poll GET /ingest/{job_id}/status until the job reaches a terminal stage.
// onUpdate fires on every poll (including the first) so the UI can render
// intermediate progress, not just the final result.
async function pollJobUntilDone(
  jobId: string,
  onUpdate: (job: IngestJob) => void,
  intervalMs = 1200,
): Promise<IngestJob> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await adminFetch(`${API_BASE}/ingest/${jobId}/status`);
    if (!res.ok) {
      throw new Error(`Lost track of job ${jobId} (status ${res.status})`);
    }
    const job: IngestJob = await res.json();
    onUpdate(job);
    if (TERMINAL_STAGES.has(job.stage)) return job;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function saveTrackedJobs(jobs: TrackedJob[], drugName: string) {
  if (jobs.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobs, drugName }));
}

function loadTrackedJobs(): { jobs: TrackedJob[]; drugName: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// Pipeline stage icon circle
const StageIcon: React.FC<{ stage: PipelineStage; status: StageStatus; isLast: boolean }> = ({
  stage, status, isLast,
}) => {
  const cls = `up-stage-icon up-stage-icon--${status}`;
  return (
    <div className="up-stage-wrap">
      <div className={cls}>
        {status === "processing" ? <Loader2 size={18} className="up-spin" /> : stage.icon}
      </div>
      <span className="up-stage-label">{stage.step}. {stage.label}</span>
      <span className={`up-stage-status up-stage-status--${status}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
      {!isLast && <div className={`up-stage-line up-stage-line--${status === "complete" ? "done" : "idle"}`} />}
    </div>
  );
};

// Processing detail log item
const DetailItem: React.FC<{ detail: ProcessingDetail; processing?: boolean }> = ({ detail, processing }) => (
  <div className={`up-detail-item${processing ? " up-detail-item--processing" : ""}`}>
    {detail.done
      ? <Check size={13} className="up-detail-check" />
      : processing
        ? <Loader2 size={13} className="up-spin up-detail-spin" />
        : <Clock size={13} className="up-detail-clock" />
    }
    <span>{detail.text}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export const UploadProcessing: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Multi-file & Form state ──
  const [files, setFiles]                 = useState<File[]>([]);
  const [drugName, setDrugName]           = useState<string>("");
  const [currentFileIndex, setCurrentFileIndex] = useState<number | null>(null);
  const [completedFileIndices, setCompletedFileIndices] = useState<number[]>([]);
  const [isDragging, setDragging]         = useState(false);

  // ── Pipeline state ──
  const initStatuses = (): Record<string, StageStatus> =>
    Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, "pending"]));

  const [stageStatuses, setStageStatuses] = useState<Record<string, StageStatus>>(initStatuses);
  const [isProcessing, setIsProcessing]   = useState(false);
  const [isDone, setIsDone]               = useState(false);
  const [hasFailed, setHasFailed]         = useState(false);
  const [revealedDetails, setDetails]     = useState<number>(0); // how many detail lines are shown
  const [detailLogs, setDetailLogs]       = useState<ProcessingDetail[]>([]);
  const [isResuming, setIsResuming]       = useState(false);

  // ── Resume any job(s) still in flight from before a reload ──
  useEffect(() => {
    const saved = loadTrackedJobs();
    if (!saved || saved.jobs.length === 0) return;

    setIsResuming(true);
    setIsProcessing(true);
    setDrugName(saved.drugName);
    setDetailLogs([{ text: `Resuming ${saved.jobs.length} upload(s) from before the reload...`, done: false }]);

    (async () => {
      const remaining: TrackedJob[] = [...saved.jobs];
      let anyFailed = false;

      for (const tracked of saved.jobs) {
        setStageStatuses(initStatuses());
        try {
          const finalJob = await pollJobUntilDone(tracked.jobId, (job) => {
            setStageStatuses(stagesForBackendStage(job.stage));
            setDetailLogs(prev => [
              ...prev.slice(0, -1),
              { text: `[${tracked.fileName}] ${job.detail}`, done: TERMINAL_STAGES.has(job.stage) },
            ]);
          });

          remaining.shift();
          saveTrackedJobs(remaining, saved.drugName);

          if (finalJob.stage === "STORED") {
            setDetailLogs(prev => [...prev, {
              text: `[${tracked.fileName}] Stored ${finalJob.chunks_stored ?? 0} chunk(s) in RAG store for "${saved.drugName}"`,
              done: true,
            }]);
          } else {
            anyFailed = true;
            setDetailLogs(prev => [...prev, {
              text: `[${tracked.fileName}] ${finalJob.error ?? "Ingestion did not complete."}`,
              done: false,
            }]);
          }
        } catch (err: any) {
          anyFailed = true;
          remaining.shift();
          saveTrackedJobs(remaining, saved.drugName);
          setDetailLogs(prev => [...prev, {
            text: `[${tracked.fileName}] ${err.message || "Lost track of this upload."}`,
            done: false,
          }]);
        }
      }

      setIsProcessing(false);
      setIsResuming(false);
      if (anyFailed) setHasFailed(true);
      else setIsDone(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── File addition & management ──
  const addFiles = (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setFiles(prev => [...prev, ...newFiles]);
    setStageStatuses(initStatuses());
    setIsProcessing(false);
    setIsDone(false);
    setHasFailed(false);
    setDetails(0);
    setCompletedFileIndices([]);
    setCurrentFileIndex(null);
    setDetailLogs([]);
  };

  // ── Drag / drop handlers ──
  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true);  }, []);
  const handleDragLeave = useCallback(() => setDragging(false), []);
  const handleDrop      = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) addFiles(dropped);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) addFiles(selected);
    e.target.value = "";
  };

  const handleRemoveFile = (indexToRemove: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
    if (files.length <= 1) {
      setStageStatuses(initStatuses());
      setIsProcessing(false);
      setIsDone(false);
      setHasFailed(false);
      setDetails(0);
      setCompletedFileIndices([]);
      setCurrentFileIndex(null);
      setDetailLogs([]);
    }
  };

  const handleRemoveAll = () => {
    setFiles([]);
    setStageStatuses(initStatuses());
    setIsProcessing(false);
    setIsDone(false);
    setHasFailed(false);
    setDetails(0);
    setCompletedFileIndices([]);
    setCurrentFileIndex(null);
    setDetailLogs([]);
  };

  // ── Real upload ingestion pipeline ──
  // Submits each file to /ingest (returns a job_id almost immediately),
  // then polls /ingest/{job_id}/status instead of holding one fetch open
  // for the whole parse/scan/embed pipeline. Tracked job_ids are persisted
  // to localStorage so a page reload mid-upload can resume polling instead
  // of losing all progress (see the resume effect above).
  const handleUpload = async () => {
    if (files.length === 0 || !drugName.trim() || isProcessing) return;
    setIsProcessing(true);
    setIsDone(false);
    setHasFailed(false);
    setDetails(0);
    setStageStatuses(initStatuses());
    setCompletedFileIndices([]);
    setDetailLogs([]);

    const cleanDrugName = drugName.trim();
    const tracked: TrackedJob[] = [];

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      setCurrentFileIndex(fIdx);
      const activeFile = files[fIdx];
      const isMulti = files.length > 1;
      const filePrefix = isMulti ? `[${fIdx + 1}/${files.length} - ${activeFile.name}] ` : "";

      setStageStatuses(initStatuses());
      setDetailLogs(prev => [
        ...prev,
        { text: `${filePrefix}Uploading document...`, done: false },
      ]);

      try {
        const formData = new FormData();
        formData.append("file", activeFile);

        const url = `${API_BASE}/ingest?drug_name=${encodeURIComponent(cleanDrugName)}`;
        const submitRes = await adminFetch(url, { method: "POST", body: formData });

        if (!submitRes.ok) {
          let errorMsg = `Server returned status ${submitRes.status}`;
          try {
            const errData = await submitRes.json();
            if (errData && errData.detail) {
              errorMsg = typeof errData.detail === "string" ? errData.detail : JSON.stringify(errData.detail);
            }
          } catch {
            // fallback to default errorMsg
          }
          throw new Error(errorMsg);
        }

        const { job_id } = await submitRes.json();
        tracked.push({ jobId: job_id, fileName: activeFile.name });
        saveTrackedJobs(tracked, cleanDrugName);

        setDetailLogs(prev => [
          ...prev.slice(0, -1),
          { text: `${filePrefix}Uploaded — processing on the server...`, done: false },
        ]);

        const finalJob = await pollJobUntilDone(job_id, (job) => {
          setStageStatuses(stagesForBackendStage(job.stage));
          setDetailLogs(prev => [
            ...prev.slice(0, -1),
            { text: `${filePrefix}${job.detail}`, done: TERMINAL_STAGES.has(job.stage) },
          ]);
        });

        // This job is resolved — drop it from the tracked list so a reload
        // after this point doesn't try to re-poll an already-finished job.
        tracked.pop();
        saveTrackedJobs(tracked, cleanDrugName);

        if (finalJob.stage !== "STORED") {
          throw new Error(finalJob.error || "Ingestion did not complete.");
        }

        const chunksStored = finalJob.chunks_stored ?? 0;
        setDetailLogs(prev => [
          ...prev.slice(0, -1),
          { text: `${filePrefix}Uploaded successfully`, done: true },
          { text: `${filePrefix}Document parsed and checked for safety`, done: true },
          { text: `${filePrefix}Stored ${chunksStored} chunk(s) in RAG store for "${cleanDrugName}"`, done: true },
        ]);
        setDetails(prev => prev + 3);
        setCompletedFileIndices(prev => [...prev, fIdx]);
      } catch (err: any) {
        setHasFailed(true);
        setStageStatuses(prev => ({
          upload: prev.upload === "complete" ? "complete" : "failed",
          validate: "failed",
          detect: "failed",
          parse: "failed",
          index: "failed",
          ready: "failed",
        }));
        setDetailLogs(prev => [
          ...prev.slice(0, -1),
          { text: `${filePrefix}Ingestion failed: ${err.message || "Unknown error"}`, done: false },
        ]);
        saveTrackedJobs(tracked, cleanDrugName);
        setIsProcessing(false);
        setCurrentFileIndex(null);
        return;
      }
    }

    saveTrackedJobs([], cleanDrugName); // batch finished clean — nothing left to resume
    setCurrentFileIndex(null);
    setIsProcessing(false);
    setIsDone(true);
  };

  const canUpload =
    files.length > 0 &&
    drugName.trim().length > 0 &&
    !isProcessing &&
    !isDone;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AdminLayout title="Upload Documentation">
      {/* ── Breadcrumb ── */}
      <nav className="up-breadcrumb" aria-label="Breadcrumb">
        <NavLink to="/admin" className="up-crumb-link">Dashboard</NavLink>
        <ChevronRight size={13} className="up-crumb-sep" />
        <span className="up-crumb-current">Upload / Processing</span>
      </nav>

      {/* ── Page subtitle ── */}
      <p className="up-subtitle">Add verified drug documentation to the DrugDoc AI knowledge base.</p>

      {isResuming && (
        <div className="admin-card" style={{ marginBottom: "20px", borderLeft: "3px solid #f59e0b" }}>
          <p style={{ margin: 0, fontSize: "13px" }}>
            Resuming upload(s) that were still in progress before the page reloaded — no need to re-upload.
          </p>
        </div>
      )}

      {/* ── Drug Name Input Card ── */}
      <div className="admin-card" style={{ marginBottom: "20px" }}>
        <label
          htmlFor="drug-name-input"
          style={{
            display: "block",
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "8px",
            color: "var(--color-text-main, #0f172a)",
          }}
        >
          Drug Name <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <input
          id="drug-name-input"
          type="text"
          value={drugName}
          onChange={e => setDrugName(e.target.value)}
          placeholder="e.g. Paracetamol"
          disabled={isProcessing}
          required
          style={{
            width: "100%",
            padding: "10px 14px",
            fontSize: "14px",
            borderRadius: "6px",
            border: "1px solid var(--color-border, #cbd5e1)",
            backgroundColor: isProcessing ? "var(--color-bg-subtle, #f8fafc)" : "#ffffff",
            color: "var(--color-text-main, #0f172a)",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* ── Top row: Drop zone + Selected files ── */}
      <div className="up-top-row">

        {/* Drop zone */}
        <div
          className={`up-dropzone${isDragging ? " up-dropzone--drag" : ""}${files.length > 0 ? " up-dropzone--has-file" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload document drop zone"
          onKeyDown={e => e.key === "Enter" && fileInputRef.current?.click()}
        >
          <UploadCloud size={44} className="up-dz-icon" />
          <p className="up-dz-heading">
            {files.length > 0 ? "Drag & drop more documents here" : "Drag & drop your document(s) here"}
          </p>
          <p className="up-dz-or">or</p>
          <button
            type="button"
            className="up-choose-btn"
            onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
          >
            {files.length > 0 ? "Choose More Files" : "Choose Files"}
          </button>
          <p className="up-dz-hint">Supported: PDF / XML documents</p>
          <p className="up-dz-hint up-dz-hint--small">Maximum file size: 50 MB per file</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.xml"
            className="up-file-input"
            onChange={handleFileChange}
            aria-label="Choose files"
          />
        </div>

        {/* Selected files card */}
        <div className="admin-card up-file-card">
          <div className="up-file-card-header" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Layers size={15} className="up-file-card-icon" />
              <span className="up-file-card-title">
                {files.length > 1 ? `Selected Files (${files.length})` : "Selected File"}
              </span>
            </div>
            {files.length > 0 && !isProcessing && (
              <button
                type="button"
                className="up-remove-all-btn"
                onClick={handleRemoveAll}
                title="Remove all files"
              >
                Remove All
              </button>
            )}
          </div>

          {files.length > 0 ? (
            <>
              <div
                className="up-file-list"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  maxHeight: "220px",
                  overflowY: "auto",
                  paddingRight: "2px",
                }}
              >
                {files.map((f, idx) => {
                  const isCurrent = currentFileIndex === idx;
                  const isCompleted = completedFileIndices.includes(idx);

                  let statusText = "Ready to upload";
                  let statusClass = "";
                  if (isCompleted) {
                    statusText = "Ready";
                    statusClass = "up-file-ready";
                  } else if (isCurrent) {
                    statusText = "Processing...";
                    statusClass = "up-file-processing";
                  }

                  return (
                    <div key={`${f.name}-${idx}`} className="up-file-info">
                      <div className="up-file-thumb">
                        <FileText size={22} className="up-file-thumb-icon" />
                      </div>
                      <div className="up-file-meta">
                        <span className="up-file-name">{f.name}</span>
                        <span className="up-file-detail">
                          {f.name.split(".").pop()?.toUpperCase() ?? "FILE"}
                          &nbsp;•&nbsp;{formatSize(f.size)}
                          &nbsp;•&nbsp;<span className={statusClass}>{statusText}</span>
                        </span>
                      </div>
                      <button
                        className="up-file-remove"
                        onClick={() => handleRemoveFile(idx)}
                        aria-label={`Remove ${f.name}`}
                        title="Remove file"
                        disabled={isProcessing}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="up-file-actions">
                <button
                  type="button"
                  className="up-change-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                >
                  <RefreshCw size={13} />
                  Add More Files
                </button>
                {!isDone ? (
                  <button
                    type="button"
                    className="up-upload-btn"
                    onClick={handleUpload}
                    disabled={!canUpload}
                  >
                    {isProcessing ? (
                      <><Loader2 size={14} className="up-spin" /> Processing…</>
                    ) : (
                      <><UploadCloud size={14} /> {files.length > 1 ? "Upload Documents" : "Upload Document"}</>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="up-upload-btn up-upload-btn--done"
                    onClick={() => navigate("/admin/library")}
                  >
                    <ArrowRight size={14} /> View in Library
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="up-file-empty">
              <FileText size={28} className="up-file-empty-icon" />
              <p className="up-file-empty-text">No files selected</p>
              <p className="up-file-empty-sub">Choose or drag files to begin.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Processing Pipeline ── */}
      <div className="admin-card up-pipeline-card">
        <div className="up-pipeline-header">
          <FileScan size={16} className="up-pipeline-header-icon" />
          <div>
            <h2 className="admin-card-title" style={{ marginBottom: 0 }}>Processing Pipeline</h2>
            <p className="admin-card-sub">
              {files.length > 1
                ? "Selected documents will go through each step to be validated, processed and indexed."
                : "Your document will go through several steps to be validated, processed and indexed."}
            </p>
          </div>
        </div>
        <div className="up-pipeline-stages">
          {PIPELINE_STAGES.map((stage, i) => (
            <StageIcon
              key={stage.id}
              stage={stage}
              status={stageStatuses[stage.id]}
              isLast={i === PIPELINE_STAGES.length - 1}
            />
          ))}
        </div>
      </div>

      {/* ── Bottom row: Processing Details + Supported Types ── */}
      <div className="up-bottom-row">

        {/* Processing Details */}
        <div className="admin-card up-details-card">
          <div className="up-details-header">
            <FileText size={15} className="up-pipeline-header-icon" />
            <h2 className="admin-card-title" style={{ marginBottom: 0 }}>Processing Details</h2>
          </div>

          {revealedDetails === 0 && detailLogs.length === 0 && !isProcessing && !hasFailed ? (
            <div className="up-details-empty">
              <Info size={18} className="up-details-empty-icon" />
              <p className="up-details-empty-text">No document uploaded yet.</p>
              <p className="up-details-empty-sub">Upload documents to see processing details here.</p>
            </div>
          ) : (
            <div className="up-details-log">
              {detailLogs.map((d, i) => (
                <DetailItem key={i} detail={d} processing={isProcessing && i === detailLogs.length - 1 && !d.done} />
              ))}
              {isDone && (
                <div className="up-details-done">
                  <CheckCircle2 size={16} className="up-details-done-icon" />
                  <span>
                    {files.length > 1
                      ? `All ${files.length} documents are ready in the library.`
                      : "Document is ready in the library."}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Supported Document Types */}
        <div className="admin-card up-types-card">
          <div className="up-details-header">
            <Layers size={15} className="up-pipeline-header-icon" />
            <h2 className="admin-card-title" style={{ marginBottom: 0 }}>Supported Document Types</h2>
          </div>

          <div className="up-types-list">
            <div className="up-type-item">
              <div className="up-type-icon up-type-icon--pdf"><FileText size={18} /></div>
              <div className="up-type-body">
                <span className="up-type-name">PDF Documents</span>
                <span className="up-type-desc">Drug labels, product information, clinical guidelines, etc.</span>
              </div>
            </div>
            <div className="up-type-item">
              <div className="up-type-icon up-type-icon--xml"><FileCode2 size={18} /></div>
              <div className="up-type-body">
                <span className="up-type-name">XML Documents</span>
                <span className="up-type-desc">Structured regulatory data (e.g. FDA, EMA, WHO)</span>
              </div>
            </div>
          </div>

          <div className="up-types-notice">
            <Info size={13} className="up-types-notice-icon" />
            <span>All uploaded documents are scanned for safety and validated before processing.</span>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
