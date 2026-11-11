import { Fragment, useState, useEffect, useCallback } from "react";
import { adminAPI } from "../../api";
import Spinner from "../../components/Spinner";
import toast from "react-hot-toast";

// ─── Labels / colours ────────────────────────────────────────────────────────
const ACTIONS = {
  "visitor.create": ["➕ Visitor added by admin", "#2b6cb0"],
  "visitor.update": ["✏️ Visitor edited", "#b7791f"],
  "visitor.delete": ["🗑️ Visitor deleted", "#c53030"],
  "visitor.register": ["📝 Visitor registered", "#2b6cb0"],
  "visitor.re_register": ["📝 Visitor re-registered", "#2b6cb0"],
  "visit.check_in": ["🟢 Checked in", "#276749"],
  "visit.check_out": ["🔴 Checked out", "#718096"],
  "quiz.passed": ["✅ Quiz passed", "#276749"],
  "quiz.failed": ["❌ Quiz failed", "#c53030"],
  "auth.login": ["🔑 Admin signed in", "#4a5568"],
  "auth.logout": ["🚪 Admin signed out", "#4a5568"],
  "auth.login_failed": ["⚠️ Failed sign-in", "#c53030"],
  "induction.create": ["🎓 Induction content added", "#2c7a7b"],
  "induction.update": ["🎓 Induction content edited", "#b7791f"],
  "induction.delete": ["🎓 Induction content deleted", "#c53030"],
  "induction.activate": ["🎓 Content activated", "#276749"],
  "induction.deactivate": ["🎓 Content deactivated", "#718096"],
  "induction.quiz_save": ["🧠 Quiz questions saved", "#2c7a7b"],
  "induction.quiz_approve": ["🧠 Quiz approved", "#276749"],
  "induction.quiz_delete": ["🧠 Quiz removed", "#c53030"],
  "question.create": ["❓ Quiz question added", "#2b6cb0"],
  "question.update": ["❓ Quiz question edited", "#b7791f"],
  "question.delete": ["❓ Quiz question deleted", "#c53030"],
  "question.translate": ["🌐 Quiz translated", "#2c7a7b"],
  "question.translation_edit": ["🌐 Translation edited", "#b7791f"],
  "question.activate": ["❓ Question switched on", "#276749"],
  "question.deactivate": ["❓ Question switched off", "#718096"],
  "settings.update": ["⚙️ Setting changed", "#b7791f"],
  "data.export": ["📥 Data exported", "#4a5568"],
};

const CATEGORIES = [
  ["", "All categories"],
  ["visitor", "Visitors"],
  ["visit", "Check-in / out"],
  ["quiz", "Quiz"],
  ["induction", "Induction"],
  ["auth", "Sign-ins"],
  ["system", "System"],
];
const ACTORS = [
  ["", "Anyone"],
  ["admin", "Admins"],
  ["visitor", "Visitors"],
  ["system", "System"],
];

const FIELD_LABELS = {
  first_name: "First name",
  last_name: "Last name",
  phone: "Phone",
  email: "Email",
  company: "Company",
  host_name: "Host",
  host_department: "Host department",
  purpose: "Purpose",
  id_type: "ID type",
  id_number: "ID number",
  language: "Language",
  induction_status: "Induction status",
  question_text: "Question",
  explanation: "Explanation",
  is_active: "Active",
  options: "Options (✔ = correct)",
  quiz_score: "Quiz score",
  quiz_attempts: "Quiz attempts",
};

const fmtTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

const show = (v) =>
  v === null || v === undefined || v === ""
    ? "—"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
const label = (k) => FIELD_LABELS[k] || k.replace(/_/g, " ");

// ─── Small module-level components (kept outside AuditPage on purpose) ───────
function ActionBadge({ action }) {
  const [text, color] = ACTIONS[action] || [action, "#4a5568"];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: "0.75rem",
        fontWeight: 700,
        color,
        background: `${color}1a`,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function ChangesTable({ before, after }) {
  const keys = Array.from(
    new Set([...Object.keys(before || {}), ...Object.keys(after || {})]),
  );
  if (keys.length === 0) return null;
  return (
    <table className="data-table" style={{ marginTop: 8 }}>
      <thead>
        <tr>
          <th>Field</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k}>
            <td style={{ fontWeight: 600 }}>{label(k)}</td>
            <td style={{ color: "var(--danger)", wordBreak: "break-word" }}>
              {show(before?.[k])}
            </td>
            <td style={{ color: "var(--success)", wordBreak: "break-word" }}>
              {show(after?.[k])}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SnapshotBox({ title, data }) {
  if (!data) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontWeight: 700,
          fontSize: "0.8rem",
          color: "var(--gray-600)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 6,
          marginTop: 6,
        }}
      >
        {Object.entries(data).map(([k, v]) => (
          <div
            key={k}
            style={{
              fontSize: "0.8rem",
              background: "white",
              border: "1px solid var(--gray-200)",
              borderRadius: 8,
              padding: "6px 10px",
            }}
          >
            <div style={{ color: "var(--gray-400)", fontSize: "0.7rem" }}>
              {label(k)}
            </div>
            <div style={{ wordBreak: "break-word" }}>{show(v)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogDetails({ log }) {
  const isUpdate =
    log.action.endsWith(".update") || (log.before_data && log.after_data);
  const isDelete = log.action.endsWith(".delete");
  const isCreate =
    log.action === "visitor.create" || log.action === "question.create";
  return (
    <div style={{ padding: "12px 4px" }}>
      {log.reason && (
        <div
          style={{
            background: "#fffaf0",
            border: "1px solid #fbd38d",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "var(--warning)",
              textTransform: "uppercase",
            }}
          >
            Reason given
          </div>
          <div
            style={{ fontSize: "0.9rem", marginTop: 2, whiteSpace: "pre-wrap" }}
          >
            {log.reason}
          </div>
        </div>
      )}

      {isUpdate && (
        <ChangesTable before={log.before_data} after={log.after_data} />
      )}
      {isDelete && (
        <SnapshotBox
          title="Record as it was before deletion"
          data={log.before_data}
        />
      )}
      {isCreate && <SnapshotBox title="Record created" data={log.after_data} />}
      {!isUpdate && !isDelete && !isCreate && log.after_data && (
        <SnapshotBox title="After" data={log.after_data} />
      )}

      {log.details &&
        typeof log.details === "object" &&
        Object.keys(log.details).length > 0 && (
          <SnapshotBox title="Details" data={log.details} />
        )}

      <div
        style={{
          marginTop: 10,
          fontSize: "0.75rem",
          color: "var(--gray-400)",
          wordBreak: "break-word",
        }}
      >
        Log #{log.id}
        {log.entity_type
          ? ` · ${log.entity_type} #${log.entity_id ?? "—"}`
          : ""}
        {log.ip_address ? ` · IP ${log.ip_address}` : ""}
        {log.user_agent ? ` · ${log.user_agent}` : ""}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
const EMPTY_FILTERS = {
  search: "",
  category: "",
  actor_type: "",
  date_from: "",
  date_to: "",
};

export default function AuditPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState(""); // debounced copy of filters.search
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ logs: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Debounce typing in the search box
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(filters.search);
      setPage(1);
    }, 400);
    return () => clearTimeout(id);
  }, [filters.search]);

  const params = useCallback(() => {
    const { category, actor_type, date_from, date_to } = filters;
    return Object.fromEntries(
      Object.entries({
        search,
        category,
        actor_type,
        date_from,
        date_to,
      }).filter(([, v]) => v),
    );
  }, [filters, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getAudit({ ...params(), page, limit: 25 });
      setData(res.data);
      setExpanded(null);
    } catch {
      toast.error("Failed to load the audit log");
    } finally {
      setLoading(false);
    }
  }, [params, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (k, v) => {
    setFilters((p) => ({ ...p, [k]: v }));
    if (k !== "search") setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await adminAPI.exportAudit(params());
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div
        className="flex-between"
        style={{ marginBottom: 16, flexWrap: "wrap", gap: 10 }}
      >
        <div>
          <h2 style={{ fontSize: "1.25rem", color: "var(--gray-800)" }}>
            🛡️ Audit Log
          </h2>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--gray-500)",
              marginTop: 2,
            }}
          >
            Everything that happens in the system — who did it, when, why, and
            what changed. This log cannot be edited or deleted.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={load}
            disabled={loading}
          >
            🔄 Refresh
          </button>
          <button
            className="btn btn-success btn-sm"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? <Spinner size="sm" /> : "📥"} Export
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group" style={{ flex: 2 }}>
          <label className="filter-label">🔍 Search</label>
          <input
            className="filter-input"
            placeholder="Name, action, reason, IP…"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">Category</label>
          <select
            className="filter-select"
            value={filters.category}
            onChange={(e) => setFilter("category", e.target.value)}
          >
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Done by</label>
          <select
            className="filter-select"
            value={filters.actor_type}
            onChange={(e) => setFilter("actor_type", e.target.value)}
          >
            {ACTORS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">From</label>
          <input
            type="date"
            className="filter-input"
            value={filters.date_from}
            onChange={(e) => setFilter("date_from", e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">To</label>
          <input
            type="date"
            className="filter-input"
            value={filters.date_to}
            onChange={(e) => setFilter("date_to", e.target.value)}
          />
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-end" }}
          onClick={() => {
            setFilters(EMPTY_FILTERS);
            setSearch("");
            setPage(1);
          }}
        >
          ✕ Clear
        </button>
      </div>

      <div className="card">
        <div className="table-wrapper">
          {loading ? (
            <div
              className="flex-center"
              style={{ padding: "48px 0", flexDirection: "column", gap: 12 }}
            >
              <Spinner size="lg" />
              <p style={{ color: "var(--gray-400)", fontSize: "0.875rem" }}>
                Loading…
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What happened</th>
                  <th>Target</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        textAlign: "center",
                        color: "var(--gray-400)",
                        padding: "40px 0",
                      }}
                    >
                      🔍 No audit entries match your filters
                    </td>
                  </tr>
                ) : (
                  data.logs.map((log) => (
                    <Fragment key={log.id}>
                      <tr
                        onClick={() =>
                          setExpanded(expanded === log.id ? null : log.id)
                        }
                        style={{
                          cursor: "pointer",
                          background:
                            expanded === log.id ? "var(--gray-50)" : undefined,
                        }}
                      >
                        <td
                          style={{
                            fontSize: "0.8rem",
                            whiteSpace: "nowrap",
                            color: "var(--gray-500)",
                          }}
                        >
                          {fmtTime(log.created_at)}
                        </td>
                        <td>
                          <div
                            style={{ fontWeight: 600, fontSize: "0.875rem" }}
                          >
                            {log.actor_name || "—"}
                          </div>
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--gray-400)",
                              textTransform: "capitalize",
                            }}
                          >
                            {log.actor_type}
                          </div>
                        </td>
                        <td>
                          <ActionBadge action={log.action} />
                        </td>
                        <td style={{ fontSize: "0.85rem" }}>
                          {log.entity_label || "—"}
                        </td>
                        <td
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--gray-600)",
                            maxWidth: 260,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {log.reason || ""}
                        </td>
                      </tr>
                      {expanded === log.id && (
                        <tr>
                          <td
                            colSpan={5}
                            style={{ background: "var(--gray-50)" }}
                          >
                            <LogDetails log={log} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <div
          className="card-footer"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "var(--gray-500)" }}>
            {data.total} entries · click a row for details
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Prev
            </button>
            <span style={{ fontSize: "0.85rem", color: "var(--gray-600)" }}>
              Page {data.page || page} of {data.pages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page >= data.pages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
