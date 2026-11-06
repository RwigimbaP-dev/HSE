import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { adminAPI } from '../../api';
import StatusBadge from '../../components/StatusBadge';
import Spinner from '../../components/Spinner';
import toast from 'react-hot-toast';

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function ReportsPage() {
  const { t } = useLanguage();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getDailyReport(date);
      setReport(res.data);
    } catch (err) {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await adminAPI.exportExcel();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `visitor-records-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Excel report downloaded!');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--gray-800)' }}>
          📋 {t('admin_daily_report')}
        </h2>
        <button className="btn btn-success btn-sm" onClick={handleExport} disabled={exporting}>
          {exporting ? <Spinner size="sm" /> : '📥'} {t('export')}
        </button>
      </div>

      {/* Date selector */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="filter-group" style={{ flex: 1, minWidth: 180 }}>
              <label className="filter-label">{t('admin_select_date')}</label>
              <input
                type="date"
                className="filter-input"
                value={date}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={loadReport}
              disabled={loading}
            >
              {loading ? <Spinner size="sm" /> : '📊'}
              {t('admin_view_report')}
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {report && (
        <>
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            <div className="stat-card primary">
              <div className="stat-icon">📅</div>
              <div className="stat-value">{report.summary.total}</div>
              <div className="stat-label">{t('admin_report_total')}</div>
            </div>
            <div className="stat-card info">
              <div className="stat-icon">🏢</div>
              <div className="stat-value">{report.summary.in}</div>
              <div className="stat-label">{t('admin_report_in')}</div>
            </div>
            <div className="stat-card gray">
              <div className="stat-icon">🚪</div>
              <div className="stat-value">{report.summary.out}</div>
              <div className="stat-label">{t('admin_report_out')}</div>
            </div>
            <div className="stat-card success">
              <div className="stat-icon">✅</div>
              <div className="stat-value">{report.summary.passed}</div>
              <div className="stat-label">{t('admin_report_passed')}</div>
            </div>
            <div className="stat-card accent">
              <div className="stat-icon">❌</div>
              <div className="stat-value">{report.summary.failed}</div>
              <div className="stat-label">{t('admin_report_failed')}</div>
            </div>
          </div>

          {/* Visits table */}
          <div className="card">
            <div className="card-header">
              <h3 style={{ fontSize: '1rem' }}>
                Visits on {new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })}
              </h3>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('admin_visitor_name')}</th>
                    <th>{t('admin_company')}</th>
                    <th>{t('admin_host')}</th>
                    <th>{t('admin_induction')}</th>
                    <th>{t('admin_quiz_score')}</th>
                    <th>{t('admin_visit_status')}</th>
                    <th>Check-In</th>
                    <th>Check-Out</th>
                  </tr>
                </thead>
                <tbody>
                  {report.visits.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '40px 0' }}>
                        No visits recorded for this date.
                      </td>
                    </tr>
                  ) : report.visits.map((v, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{v.full_name}</td>
                      <td>{v.company}</td>
                      <td>{v.host_name}</td>
                      <td><StatusBadge status={v.induction_status} type="induction" /></td>
                      <td style={{
                        fontWeight: v.quiz_score >= 80 ? 700 : 400,
                        color: v.quiz_score >= 80 ? 'var(--success)' : v.quiz_score > 0 ? 'var(--danger)' : 'var(--gray-400)',
                      }}>
                        {v.quiz_score > 0 ? `${v.quiz_score}%` : '—'}
                      </td>
                      <td><StatusBadge status={v.status} type="visit" /></td>
                      <td style={{ fontSize: '0.875rem' }}>{formatTime(v.check_in_time)}</td>
                      <td style={{ fontSize: '0.875rem' }}>{formatTime(v.check_out_time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!report && !loading && (
        <div className="card">
          <div className="flex-center" style={{ padding: '64px 0', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: '3rem' }}>📊</span>
            <p style={{ color: 'var(--gray-500)' }}>Select a date and click "{t('admin_view_report')}"</p>
          </div>
        </div>
      )}
    </div>
  );
}
