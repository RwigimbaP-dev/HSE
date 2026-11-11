import { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { adminAPI } from "../../api";
import toast from "react-hot-toast";

const NAV_ITEMS = [
  {
    id: "dashboard",
    icon: "📊",
    labelKey: "admin_dashboard",
    path: "/admin/dashboard",
  },
  {
    id: "visitors",
    icon: "👥",
    labelKey: "admin_visitors",
    path: "/admin/visitors",
  },
  {
    id: "induction",
    icon: "🎓",
    labelKey: "admin_induction",
    path: "/admin/induction",
  },
  {
    id: "questions",
    icon: "❓",
    label: "Quiz Questions",
    path: "/admin/questions",
  },
  {
    id: "reports",
    icon: "📋",
    labelKey: "admin_reports",
    path: "/admin/reports",
  },
  { id: "qr", icon: "🔲", labelKey: "admin_qr_code", path: "/admin/qr" },
  { id: "audit", icon: "🛡️", label: "Audit Log", path: "/admin/audit" },
];

export default function AdminLayout() {
  const { admin, logout, isAuthenticated } = useAuth();
  const { t, language, changeLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // PrivateRoute already blocks unauthenticated access before this component
  // renders. This effect only handles the edge case where a token expires
  // while the user is already on an admin page.
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/admin/login?reason=expired", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleLogout = async () => {
    try {
      await adminAPI.logout();
    } catch {}
    logout();
    toast.success("Logged out successfully");
    navigate("/admin/login", { replace: true });
  };

  const isActive = (path) => location.pathname === path;

  // While waiting for the useEffect redirect on expiry, render nothing
  if (!isAuthenticated) return null;

  return (
    <div className="admin-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 99,
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">🏢</span>
          <div className="sidebar-logo-text">
            <h3>HSE VMS</h3>
            <p>Admin Portal</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${isActive(item.path) ? "active" : ""}`}
              onClick={() => {
                navigate(item.path);
                setSidebarOpen(false);
              }}
            >
              <span className="nav-item-icon">{item.icon}</span>
              {item.label || t(item.labelKey)}
            </button>
          ))}
        </nav>

        {/* Language switcher in sidebar */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <p
            style={{
              fontSize: "0.7rem",
              color: "rgba(255,255,255,0.4)",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Language
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              ["en", "🇬🇧"],
              ["fr", "🇫🇷"],
              ["rw", "🇷🇼"],
            ].map(([lang, flag]) => (
              <button
                key={lang}
                onClick={() => changeLanguage(lang)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: "none",
                  cursor: "pointer",
                  background:
                    language === lang ? "rgba(255,255,255,0.2)" : "transparent",
                  color: language === lang ? "white" : "rgba(255,255,255,0.5)",
                  fontSize: "0.8rem",
                  fontWeight: language === lang ? 700 : 400,
                }}
              >
                {flag} {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <div
            style={{
              fontSize: "0.8rem",
              color: "rgba(255,255,255,0.5)",
              marginBottom: 10,
            }}
          >
            <p style={{ fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
              {admin?.fullName}
            </p>
            <p>{admin?.role}</p>
          </div>
          <button
            className="btn btn-ghost btn-sm btn-full"
            onClick={handleLogout}
            style={{
              color: "rgba(255,255,255,0.7)",
              borderColor: "rgba(255,255,255,0.2)",
            }}
          >
            🚪 {t("admin_logout")}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="admin-main">
        {/* Topbar */}
        <header className="admin-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Mobile hamburger */}
            <button
              className="btn-icon"
              onClick={() => setSidebarOpen((s) => !s)}
              style={{ display: "none" }}
              id="hamburger-btn"
            >
              ☰
            </button>
            <div className="topbar-title">
              <h2>{t("admin_title")}</h2>
              <p>
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a
              href="/"
              target="_blank"
              style={{
                fontSize: "0.8rem",
                color: "var(--gray-500)",
                textDecoration: "none",
              }}
            >
              🌐 Visitor Portal ↗
            </a>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--primary)",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "0.9rem",
              }}
            >
              {admin?.username?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="admin-content">
          <Outlet />
        </div>
      </main>

      <style>{`
        @media (max-width: 900px) {
          #hamburger-btn { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
