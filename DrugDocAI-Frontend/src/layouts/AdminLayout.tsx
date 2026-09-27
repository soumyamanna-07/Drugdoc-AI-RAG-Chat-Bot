import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  UploadCloud,
  ScrollText,
  ShieldCheck,
  Headphones,
  LogOut,
} from "lucide-react";
import { NotificationDropdown } from "../components/admin/NotificationDropdown";
import { mockAuth } from "../auth/mockAuth";
import { Footer } from "../components/Footer";

// ── Admin Sidebar Navigation Items ───────────────────────────────────────────
const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/library", label: "Document Library", icon: BookOpen },
  { to: "/admin/upload", label: "Upload / Processing", icon: UploadCloud },
  { to: "/admin/audit", label: "Audit Logs", icon: ScrollText },
  { to: "/admin/support", label: "Human Support", icon: Headphones },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children, title }) => {
  const navigate = useNavigate();
  const user = mockAuth.getCurrentUser();
  const userName = user?.name ?? "Admin";

  const handleLogout = () => {
    mockAuth.logout();
    navigate("/login");
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="admin-shell">
      {/* ── Sidebar ── */}
      <aside className="admin-sidebar">
        {/* Brand */}
        <button
          type="button"
          className="admin-sidebar-brand"
          onClick={() => navigate("/admin")}
          aria-label="Go to Admin Dashboard"
        >
          <div className="admin-brand-mark" aria-hidden="true">
            <div className="admin-brand-pill admin-brand-pill-a" />
            <div className="admin-brand-pill admin-brand-pill-b" />
            <div className="admin-brand-pill admin-brand-pill-c" />
          </div>

          <div className="admin-brand-text">
            <span className="admin-brand-name">
              DrugDoc <b>AI</b>
            </span>
            <span className="admin-brand-sub">
              Better Information. Healthier Decisions.
            </span>
          </div>
        </button>

        <div className="admin-panel-label">ADMIN PANEL</div>

        {/* Nav */}
        <nav className="admin-sidebar-nav" aria-label="Admin navigation">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `admin-nav-item${isActive ? " admin-nav-item--active" : ""}`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Trust card at bottom */}
        <div className="admin-sidebar-trust">
          <ShieldCheck size={16} className="admin-trust-icon" />
          <p className="admin-trust-text">
            Maintaining trust through verified medical information.
          </p>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="admin-main">
        {/* Top bar */}
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            {title && (
              <>
                <h1 className="admin-topbar-title">{title}</h1>
                <p className="admin-topbar-sub">
                  Manage documents, monitor system activity and ensure reliable, up-to-date medical information.
                </p>
              </>
            )}
          </div>
          <div className="admin-topbar-right">
            <div className="admin-datetime">
              <span className="admin-datetime-date">{dateStr}</span>
              <span className="admin-datetime-time">{timeStr}</span>
            </div>
            <NotificationDropdown />
            <div className="admin-user-pill">
              <span className="admin-user-avatar">{userName.charAt(0).toUpperCase()}</span>
              <span className="admin-user-name">{userName.charAt(0).toUpperCase() + userName.slice(1)}</span>
            </div>
            <button className="admin-logout-btn" onClick={handleLogout} aria-label="Sign out" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="admin-content">
          {children}
        </div>

        <Footer />
      </div>
    </div>
  );
};
