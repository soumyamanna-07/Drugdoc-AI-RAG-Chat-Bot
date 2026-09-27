import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../../layouts/AdminLayout";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from "lucide-react";
import { adminFetch } from "../../auth/adminApi";
import type { RecentUpload, ActivityLog } from "../../data/adminData";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

interface DashboardStats {
  documents_indexed: number;
  chunks_indexed: number;
  pending_reviews: number;
  audit_entries: number;
  audit_chain_valid: boolean;
}

interface DashboardData {
  source_distribution: { name: string; count: number }[];
  recent_uploads: any[];
  recent_activity: any[];
  processing_activity: { label: string; uploaded: number; processed: number }[];
}

// ── Tiny SVG Line + Area Chart ────────────────────────────────────────────────
const ActivityChart: React.FC<{ data: { label: string; uploaded: number; processed: number }[] }> = ({ data }) => {
  const W = 440;
  const H = 160;
  const PAD = { top: 10, right: 12, bottom: 32, left: 28 };
  const chartData = data.length ? data : [{ label: "No data", uploaded: 0, processed: 0 }];
  const maxVal = Math.max(...chartData.map((d) => Math.max(d.uploaded, d.processed)));
  const yMax = Math.ceil(maxVal / 5) * 5 || 20;

  const xStep = chartData.length > 1 ? (W - PAD.left - PAD.right) / (chartData.length - 1) : 0;
  const yScale = (v: number) => PAD.top + ((yMax - v) / yMax) * (H - PAD.top - PAD.bottom);
  const xOf = (i: number) => PAD.left + i * xStep;

  const polyPoints = (key: "uploaded" | "processed") =>
    chartData.map((d, i) => `${xOf(i)},${yScale(d[key])}`).join(" ");

  const areaPath = (key: "uploaded" | "processed") => {
    const pts = chartData.map((d, i) => `${xOf(i)},${yScale(d[key])}`).join(" L ");
    const bottom = H - PAD.bottom;
    return `M ${xOf(0)},${yScale(chartData[0][key])} L ${pts} L ${xOf(chartData.length - 1)},${bottom} L ${xOf(0)},${bottom} Z`;
  };

  // Tick x-labels: show every ~5 steps
  const xTicks = chartData
    .map((d, i) => ({ i, label: d.label }))
    .filter((_, i) => i % 5 === 0 || i === data.length - 1);

  const yTicks = [0, 5, 10, 15, yMax];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="admin-chart-svg"
      aria-label="Document processing activity over 30 days"
      role="img"
    >
      <defs>
        <linearGradient id="grad-uploaded" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="grad-processed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#12888b" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#12888b" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y-axis grid lines + labels */}
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={PAD.left} y1={yScale(v)}
            x2={W - PAD.right} y2={yScale(v)}
            stroke="#e5e7eb" strokeWidth="1"
          />
          <text
            x={PAD.left - 5} y={yScale(v)}
            textAnchor="end" dominantBaseline="middle"
            fontSize="9" fill="#9ca3af"
          >
            {v}
          </text>
        </g>
      ))}

      {/* Area fills */}
      <path d={areaPath("uploaded")}  fill="url(#grad-uploaded)" />
      <path d={areaPath("processed")} fill="url(#grad-processed)" />

      {/* Lines */}
      <polyline
        points={polyPoints("uploaded")}
        fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round"
      />
      <polyline
        points={polyPoints("processed")}
        fill="none" stroke="#12888b" strokeWidth="2" strokeLinejoin="round"
      />

      {/* Dots on key points */}
      {chartData.map((d, i) =>
        i % 5 === 0 || i === chartData.length - 1 ? (
          <g key={i}>
            <circle cx={xOf(i)} cy={yScale(d.uploaded)}  r="3" fill="#3b82f6" />
            <circle cx={xOf(i)} cy={yScale(d.processed)} r="3" fill="#12888b" />
          </g>
        ) : null
      )}

      {/* X-axis labels */}
      {xTicks.map(({ i, label }) => (
        <text
          key={i}
          x={xOf(i)} y={H - PAD.bottom + 14}
          textAnchor="middle"
          fontSize="9" fill="#9ca3af"
        >
          {label}
        </text>
      ))}
    </svg>
  );
};

// ── Donut Chart ───────────────────────────────────────────────────────────────
const DonutChart: React.FC<{ data: { name: string; count: number; color?: string }[] }> = ({ data }) => {
  const total = data.reduce((s, d) => s + d.count, 0);
  const R = 68;
  const cx = 90;
  const cy = 90;
  const strokeW = 28;

  const segments = useMemo(() => {
    let cumulative = 0;
    return data.map((seg, index) => {
      const pct = total ? seg.count / total : 0;
      const start = cumulative;
      cumulative += pct;
      return { ...seg, color: seg.color || ["#003d41", "#12888b", "#f5c27a", "#d9a97b"][index % 4], pct, start };
    });
  }, [total]);

  const polarToXY = (pct: number) => {
    const angle = pct * 2 * Math.PI - Math.PI / 2;
    return {
      x: cx + R * Math.cos(angle),
      y: cy + R * Math.sin(angle),
    };
  };

  const describeArc = (startPct: number, endPct: number) => {
    const s = polarToXY(startPct);
    const e = polarToXY(endPct - 0.001);
    const large = endPct - startPct > 0.5 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  return (
    <div className="admin-donut-wrap">
      <svg viewBox="0 0 180 180" className="admin-donut-svg" aria-label="Source distribution donut chart" role="img">
        {segments.map((seg) => (
          <path
            key={seg.name}
            d={describeArc(seg.start, seg.start + seg.pct)}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeW}
            strokeLinecap="butt"
          />
        ))}
        {/* Centre text */}
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="22" fontWeight="800" fill="#003d41">
          {total}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="#6b7280">
          Total
        </text>
        <text x={cx} y={cy + 22} textAnchor="middle" fontSize="10" fill="#6b7280">
          Documents
        </text>
      </svg>
      <ul className="admin-donut-legend">
        {segments.map((seg) => (
          <li key={seg.name} className="admin-donut-legend-item">
            <span className="admin-donut-legend-dot" style={{ background: seg.color }} />
            <span className="admin-donut-legend-name">{seg.name}</span>
            <span className="admin-donut-legend-count">
              {seg.count} ({Math.round(seg.pct * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ── Status Badge ──────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: RecentUpload["status"] }> = ({ status }) => (
  <span className={`admin-status-badge admin-status-badge--${status.toLowerCase()}`}>
    {status}
  </span>
);

// ── Activity Dot ──────────────────────────────────────────────────────────────
const ActivityDot: React.FC<{ color: ActivityLog["dotColor"] }> = ({ color }) => (
  <span className={`admin-activity-dot admin-activity-dot--${color}`} aria-hidden="true" />
);

// ── KPI Card ──────────────────────────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ReactNode;
  iconClass: string;
  value: number;
  label: string;
  delta: string;
  isUp: boolean;
  isError?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, iconClass, value, label, delta, isUp, isError }) => (
  <div className={`admin-kpi-card${isError ? " admin-kpi-card--error" : ""}`}>
    <div className={`admin-kpi-icon ${iconClass}`}>{icon}</div>
    <div className="admin-kpi-info">
      <div className={`admin-kpi-value${isError ? " admin-kpi-value--error" : ""}`}>{value}</div>
      <div className="admin-kpi-label">{label}</div>
      <div className={`admin-kpi-delta${isUp ? " admin-kpi-delta--up" : " admin-kpi-delta--down"}`}>
        {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
        <span>{delta}</span>
      </div>
    </div>
  </div>
);

// ── Main Dashboard Page ───────────────────────────────────────────────────────
export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData>({ source_distribution: [], recent_uploads: [], recent_activity: [], processing_activity: [] });
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch(`${API_BASE}/dashboard/stats`)
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data: DashboardStats) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setStatsError(err.message || "Failed to load stats");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    adminFetch(`${API_BASE}/dashboard/data`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`status ${res.status}`)))
      .then((data: DashboardData) => setDashboardData(data))
      .catch(() => undefined);
  }, []);


  return (
    <AdminLayout title="Admin Dashboard">
      {statsError && (
        <div className="admin-card" style={{ marginBottom: "16px", borderLeft: "3px solid #ef4444" }}>
          <p style={{ margin: 0, fontSize: "13px" }}>Couldn't load live stats ({statsError}) — is the backend running?</p>
        </div>
      )}

      {/* KPI Row — every number here is real (/dashboard/stats), not sample data.
          No trend deltas: this system doesn't track historical KPI snapshots,
          so a fake "+12 this month" would just be invented. */}
      <div className="admin-kpi-row">
        <KpiCard
          icon={<FileText size={22} />}
          iconClass="admin-kpi-icon--blue"
          value={stats?.documents_indexed ?? 0}
          label="Documents Indexed"
          delta="Live"
          isUp={true}
        />
        <KpiCard
          icon={<CheckCircle2 size={22} />}
          iconClass="admin-kpi-icon--teal"
          value={stats?.chunks_indexed ?? 0}
          label="Chunks Indexed"
          delta="Live"
          isUp={true}
        />
        <KpiCard
          icon={<Clock size={22} />}
          iconClass="admin-kpi-icon--orange"
          value={stats?.pending_reviews ?? 0}
          label="Pending Reviews"
          delta="Live"
          isUp={false}
        />
        <KpiCard
          icon={<AlertTriangle size={22} />}
          iconClass="admin-kpi-icon--red"
          value={stats ? (stats.audit_chain_valid ? 0 : 1) : 0}
          label="Audit Chain"
          delta={stats ? (stats.audit_chain_valid ? "Valid" : "TAMPERED") : "Live"}
          isUp={false}
          isError={!!stats && !stats.audit_chain_valid}
        />
      </div>

      {/* Charts Row */}
      <div className="admin-charts-row">
        {/* Activity Chart */}
        <div className="admin-card admin-card--chart">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">
                <FileText size={16} /> Document Processing Activity
              </h2>
              <p className="admin-card-sub">
                Number of documents uploaded and processed over the last 30 days.
              </p>
            </div>
            <div className="admin-chart-legend">
              <span className="admin-chart-legend-item admin-chart-legend-item--blue">Uploaded</span>
              <span className="admin-chart-legend-item admin-chart-legend-item--teal">Processed</span>
            </div>
          </div>
          <ActivityChart data={dashboardData.processing_activity} />
        </div>

        {/* Source Distribution */}
        <div className="admin-card admin-card--donut">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">
                <FileText size={16} /> Documents by Source Type
              </h2>
            </div>
          </div>
          <DonutChart data={dashboardData.source_distribution} />
        </div>
      </div>

      {/* Tables Row */}
      <div className="admin-tables-row">
        {/* Recent Uploads */}
        <div className="admin-card admin-card--table">
          <div className="admin-card-header">
            <h2 className="admin-card-title">
              <FileText size={16} /> Recent Uploads
            </h2>
            <button className="admin-view-all-btn" type="button" onClick={() => navigate("/admin/library")}>
              View All <ArrowRight size={13} />
            </button>
          </div>
          <table className="admin-table" aria-label="Recent uploads">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Source</th>
                <th>Status</th>
                <th>Uploaded On</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dashboardData.recent_uploads.map((row: any, index) => (
                <tr key={row.id || row.filename || index}>
                  <td className="admin-table-filename">{row.fileName || row.filename}</td>
                  <td>{row.source || row.source_type}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td className="admin-table-date">{(row.uploadedOn || row.ingestion_timestamp || "").replace("\n", " ")}</td>
                  <td>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent Activity */}
        <div className="admin-card admin-card--table">
          <div className="admin-card-header">
            <h2 className="admin-card-title">
              <FileText size={16} /> Recent Activity
            </h2>
            <button className="admin-view-all-btn" type="button" onClick={() => navigate("/admin/audit")}>
              View All <ArrowRight size={13} />
            </button>
          </div>
          <table className="admin-table" aria-label="Recent activity">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {dashboardData.recent_activity.map((row: any, index) => (
                <tr key={row.id || index}>
                  <td className="admin-table-time">{new Date((row.timestamp || 0) * 1000).toLocaleString()}</td>
                  <td>{row.user || "system"}</td>
                  <td>
                    <span className="admin-activity-action">
                      <ActivityDot color="teal" />
                      {row.event_type || row.action}
                    </span>
                  </td>
                  <td className="admin-table-detail">{row.details || row.resource || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
};
