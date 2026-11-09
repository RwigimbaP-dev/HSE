import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { adminAPI } from "../../api";
import StatusBadge from "../../components/StatusBadge";
import Spinner from "../../components/Spinner";
import ReasonModal from "../../components/ReasonModal";
import VisitorFormModal from "../../components/VisitorFormModal";
import toast from "react-hot-toast";

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VisitorsPage() {
  const { t } = useLanguage();
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);

  // CRUD state
  const [formModal, setFormModal] = useState(null); // { mode: 'create' | 'edit', visitor? }
  const [pendingEdit, setPendingEdit] = useState(null); // changes waiting for a reason
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const [filters, setFilters] = useState({
    search: "",
    status: "",
    induction_status: "",
    date_from: "",
    date_to: "",
    host_name: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Only send non-empty filters
      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== ""),
      );
      const res = await adminAPI.getVisitors(activeFilters);
      setVisitors(res.data.visitors);
      setTotal(res.data.total);
    } catch (err) {
      toast.error("Failed to load visitor records");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      search: "",
      status: "",
      induction_status: "",
      date_from: "",
      date_to: "",
      host_name: "",
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await adminAPI.exportExcel();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `visitor-records-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Excel file downloaded successfully!");
    } catch (err) {
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  const handleFormSubmit = async (form) => {
    if (formModal.mode === "create") {
      setBusy(true);
      try {
        await adminAPI.createVisitor(form);
        toast.success("Visitor added");
        setFormModal(null);
        load();
      } catch (err) {
        toast.error(err.response?.data?.message || "Could not add visitor");
      } finally {
        setBusy(false);
      }
      return;
    }
    // Edit: only continue if something really changed, then ask for the reason
    const original = formModal.visitor;
    const changed = Object.keys(form).some(
      (k) => String(form[k] ?? "") !== String(original[k] ?? ""),
    );
    if (!changed) {
      toast("Nothing was changed");
      return;
    }
    setPendingEdit({ id: original.id, data: form });
  };

  const confirmEdit = async (reason) => {
    setBusy(true);
    try {
      await adminAPI.updateVisitor(pendingEdit.id, {
        ...pendingEdit.data,
        reason,
      });
      toast.success("Visitor updated");
      setPendingEdit(null);
      setFormModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not update visitor");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async (reason) => {
    setBusy(true);
    try {
      await adminAPI.deleteVisitor(deleteTarget.id, reason);
      toast.success("Visitor deleted");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not delete visitor");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Header row */}
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", color: "var(--gray-800)" }}>
            👥 {t("admin_visitors")}
          </h2>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--gray-500)",
              marginTop: 2,
            }}
          >
            {total} records found
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={load}
            disabled={loading}
          >
            🔄 {loading ? t("loading") : "Refresh"}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setFormModal({ mode: "create" })}
          >
            ➕ Add visitor
          </button>
          <button
            className="btn btn-success btn-sm"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? <Spinner size="sm" /> : "📥"}
            {t("export")}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="filter-group" style={{ flex: 2 }}>
          <label className="filter-label">🔍 {t("search")}</label>
          <input
            className="filter-input"
            placeholder={t("admin_search_placeholder")}
            value={filters.search}
            onChange={(e) => handleFilterChange("search", e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Visit Status</label>
          <select
            className="filter-select"
            value={filters.status}
            onChange={(e) => handleFilterChange("status", e.target.value)}
          >
            <option value="">{t("admin_filter_all")}</option>
            <option value="IN">{t("admin_filter_in")}</option>
            <option value="OUT">{t("admin_filter_out")}</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Induction</label>
          <select
            className="filter-select"
            value={filters.induction_status}
            onChange={(e) =>
              handleFilterChange("induction_status", e.target.value)
            }
          >
            <option value="">{t("admin_filter_all")}</option>
            <option value="passed">{t("admin_filter_passed")}</option>
            <option value="failed">{t("admin_filter_failed")}</option>
            <option value="pending">{t("admin_filter_pending")}</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">{t("admin_date_from")}</label>
          <input
            type="date"
            className="filter-input"
            value={filters.date_from}
            onChange={(e) => handleFilterChange("date_from", e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">{t("admin_date_to")}</label>
          <input
            type="date"
            className="filter-input"
            value={filters.date_to}
            onChange={(e) => handleFilterChange("date_to", e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">{t("admin_host")}</label>
          <input
            className="filter-input"
            placeholder="Person visited..."
            value={filters.host_name}
            onChange={(e) => handleFilterChange("host_name", e.target.value)}
          />
        </div>

        <button
          className="btn btn-ghost btn-sm"
          onClick={handleClearFilters}
          style={{ alignSelf: "flex-end" }}
        >
          ✕ Clear
        </button>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrapper">
          {loading ? (
            <div
              className="flex-center"
              style={{ padding: "48px 0", flexDirection: "column", gap: 12 }}
            >
              <Spinner size="lg" />
              <p style={{ color: "var(--gray-400)", fontSize: "0.875rem" }}>
                {t("loading")}
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("admin_visitor_name")}</th>
                  <th>{t("admin_phone")}</th>
                  <th>{t("admin_company")}</th>
                  <th>{t("admin_host")}</th>
                  <th>{t("admin_purpose")}</th>
                  <th>{t("admin_induction")}</th>
                  <th>{t("admin_quiz_score")}</th>
                  <th>{t("admin_visit_status")}</th>
                  <th>{t("admin_checkin_time")}</th>
                  <th>{t("admin_checkout_time")}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visitors.length === 0 ? (
                  <tr>
                    <td
                      colSpan={12}
                      style={{
                        textAlign: "center",
                        color: "var(--gray-400)",
                        padding: "40px 0",
                      }}
                    >
                      🔍 {t("admin_no_records")}
                    </td>
                  </tr>
                ) : (
                  visitors.map((v, i) => (
                    <tr key={v.id}>
                      <td
                        style={{ color: "var(--gray-400)", fontSize: "0.8rem" }}
                      >
                        {v.id}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {v.first_name} {v.last_name}
                        </div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--gray-400)",
                          }}
                        >
                          {v.email}
                        </div>
                      </td>
                      <td style={{ fontSize: "0.875rem" }}>{v.phone}</td>
                      <td style={{ fontSize: "0.875rem" }}>{v.company}</td>
                      <td style={{ fontSize: "0.875rem" }}>
                        <div>{v.host_name}</div>
                        {v.host_department && (
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--gray-400)",
                            }}
                          >
                            {v.host_department}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--gray-500)",
                          textTransform: "capitalize",
                        }}
                      >
                        {v.purpose}
                      </td>
                      <td>
                        <StatusBadge
                          status={v.induction_status}
                          type="induction"
                        />
                      </td>
                      <td
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: v.quiz_score >= 80 ? 700 : 400,
                          color:
                            v.quiz_score >= 80
                              ? "var(--success)"
                              : v.quiz_score > 0
                                ? "var(--danger)"
                                : "var(--gray-400)",
                        }}
                      >
                        {v.quiz_score > 0 ? `${v.quiz_score}%` : "—"}
                      </td>
                      <td>
                        {v.visit_status ? (
                          <StatusBadge status={v.visit_status} type="visit" />
                        ) : (
                          <span className="badge badge-na">N/A</span>
                        )}
                      </td>
                      <td
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--gray-500)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDateTime(v.check_in_time)}
                      </td>
                      <td
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--gray-500)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDateTime(v.check_out_time)}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Edit visitor"
                          onClick={() =>
                            setFormModal({ mode: "edit", visitor: v })
                          }
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Delete visitor"
                          onClick={() => setDeleteTarget(v)}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {visitors.length > 0 && (
          <div
            className="card-footer"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "0.875rem", color: "var(--gray-500)" }}>
              Showing {visitors.length} of {total} records
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? <Spinner size="sm" /> : "📥"} {t("export")}
            </button>
          </div>
        )}
      </div>

      <VisitorFormModal
        open={!!formModal}
        mode={formModal?.mode}
        visitor={formModal?.visitor}
        saving={busy && !pendingEdit}
        onSubmit={handleFormSubmit}
        onCancel={() => setFormModal(null)}
      />

      <ReasonModal
        open={!!pendingEdit}
        title="Reason for this change"
        message="Tell us why this visitor record is being changed. It is saved in the audit log together with the old and new values."
        confirmLabel="Save changes"
        loading={busy}
        onConfirm={confirmEdit}
        onCancel={() => setPendingEdit(null)}
      />

      <ReasonModal
        open={!!deleteTarget}
        danger
        title="Delete visitor"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.first_name} ${deleteTarget.last_name}? All their visits and quiz results are deleted too.${deleteTarget.visit_status === "IN" ? " This visitor is currently checked in." : ""} This cannot be undone.`
            : ""
        }
        confirmLabel="Delete visitor"
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
