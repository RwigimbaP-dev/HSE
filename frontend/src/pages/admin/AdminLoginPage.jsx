import { useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import Spinner from '../../components/Spinner';
import { adminAPI } from '../../api';
import toast from 'react-hot-toast';

export default function AdminLoginPage() {
  const { t } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // Show a notice if the user was redirected due to an expired session
  const reason = searchParams.get('reason');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await adminAPI.login(form.username, form.password);
      login(res.data.admin, res.data.token);
      toast.success(`Welcome back, ${res.data.admin.fullName}!`);
      // Redirect back to the page they tried to visit, or dashboard
      const from = location.state?.from?.pathname || '/admin/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(t('admin_invalid_creds'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="login-logo">
          <div className="login-logo-icon">🏢</div>
          <h1>{t('admin_login_title')}</h1>
          <p>{t('admin_login_subtitle')}</p>
        </div>

        {reason === 'expired' && (
          <div className="alert alert-warning" style={{ marginBottom: 20 }}>
            ⏰ Your session has expired. Please sign in again.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">👤 {t('admin_username')}</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              className="form-input"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">🔒 {t('admin_password')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="form-input"
                autoComplete="current-password"
                required
                style={{ paddingRight: 48 }}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                style={{
                  position: 'absolute', right: 12, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: '1.1rem', color: 'var(--gray-400)',
                }}
              >
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-full"
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? <Spinner size="sm" /> : <span>🔐</span>}
            {t('admin_login_btn')}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
            ← Back to Visitor Portal
          </button>
        </div>
      </div>
    </div>
  );
}
