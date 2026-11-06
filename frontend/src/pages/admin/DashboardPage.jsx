import { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { adminAPI } from '../../api';
import Spinner from '../../components/Spinner';
import StatusBadge from '../../components/StatusBadge';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import toast from 'react-hot-toast';

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function DashboardPage() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await adminAPI.getDashboard();
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: 400, flexDirection: 'column', gap: 16 }}>
        <Spinner size="lg" />
        <p style={{ color: 'var(--gray-400)' }}>{t('loading')}</p>
      </div>
    );
  }

  if (!data) return null;

  const { stats, trend, recentVisitors } = data;

  const statCards = [
    { label: t('admin_total_visitors'), value: stats.totalVisitors, icon: '👥', color: 'primary' },
    { label: t('admin_currently_in'), value: stats.visitorsIN, icon: '🏢', color: 'info' },
    { label: t('admin_checked_out'), value: stats.visitorsOUT, icon: '🚪', color: 'gray' },
    { label: t('admin_today_visitors'), value: stats.todayVisitors, icon: '📅', color: 'accent' },
    { label: t('admin_passed_induction'), value: stats.passedInduction, icon: '✅', color: 'success' },
    { label: t('admin_failed_induction'), value: stats.failedInduction, icon: '❌', color: 'warning' },
  ];

  return (
    <div>
      {/* Stats grid */}
      <div className="stats-grid">
        {statCards.map((card) => (
          <div key={card.label} className={`stat-card ${card.color}`}>
            <div className="stat-icon">{card.icon}</div>
            <div className="stat-value">{card.value}</div>
            <div className="stat-label">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Line chart */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: '1rem', color: 'var(--gray-700)' }}>
              📈 {t('admin_trend_chart')}
            </h3>
            <button className="btn-icon" onClick={load} title="Refresh">🔄</button>
          </div>
          <div className="card-body" style={{ padding: '16px 20px' }}>
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(val) => [val, t('admin_weekly_visits')]}
                    labelFormatter={(l) => `Date: ${l}`}
                  />
                  <Line type="monotone" dataKey="count" stroke="#1a365d"
                    strokeWidth={2} dot={{ fill: '#1a365d', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex-center" style={{ height: 200 }}>
                <p style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>No visit data yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Bar chart: induction status */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: '1rem', color: 'var(--gray-700)' }}>
              🎯 Induction Overview
            </h3>
          </div>
          <div className="card-body" style={{ padding: '16px 20px' }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={[
                  { name: 'Passed', value: stats.passedInduction },
                  { name: 'Failed', value: stats.failedInduction },
                  { name: 'Pending', value: stats.pendingInduction },
                ]}
                margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(val) => [val, 'Visitors']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  <Cell fill="#276749" />
                  <Cell fill="#c53030" />
                  <Cell fill="#d97706" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent visitors */}
      <div className="card">
        <div className="card-header">
          <h3 style={{ fontSize: '1rem', color: 'var(--gray-700)' }}>
            🕐 {t('admin_recent_visitors')}
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
                <th>{t('admin_visit_status')}</th>
                <th>{t('admin_checkin_time')}</th>
              </tr>
            </thead>
            <tbody>
              {recentVisitors.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}>
                  {t('admin_no_records')}
                </td></tr>
              ) : recentVisitors.map((v, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{v.first_name} {v.last_name}</td>
                  <td>{v.company}</td>
                  <td>{v.host_name}</td>
                  <td><StatusBadge status={v.induction_status} type="induction" /></td>
                  <td>
                    {v.visit_status
                      ? <StatusBadge status={v.visit_status} type="visit" />
                      : <span className="badge badge-na">N/A</span>}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                    {formatDateTime(v.check_in_time)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
