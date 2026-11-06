import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import LanguageSelector from '../../components/LanguageSelector';

export default function LandingPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="visitor-page">
      <div className="visitor-header">
        <div className="visitor-logo">🏢</div>
        <h1>{t('landing_title')}</h1>
        <p>{t('landing_subtitle')}</p>
      </div>

      <LanguageSelector />

      <div className="visitor-card" style={{ maxWidth: 560 }}>
        <div className="visitor-card-body" style={{ padding: '40px 36px' }}>
          {/* QR scan instruction */}
          <div style={{
            background: 'linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 100%)',
            borderRadius: 12,
            padding: '20px 24px',
            marginBottom: 28,
            textAlign: 'center',
            border: '1.5px dashed #93c5fd',
          }}>
            <span style={{ fontSize: '2.5rem' }}>📱</span>
            <p style={{ fontSize: '0.875rem', color: '#2c5282', fontWeight: 600, marginTop: 8 }}>
              {t('landing_scan_msg')}
            </p>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button
              className="btn btn-primary btn-lg btn-full"
              onClick={() => navigate('/visitor/register')}
              style={{ fontSize: '1rem', padding: '16px 24px' }}
            >
              <span>👤</span>
              {t('landing_new_visitor')}
            </button>

            <button
              className="btn btn-outline btn-lg btn-full"
              onClick={() => navigate('/visitor/checkout')}
              style={{ fontSize: '1rem', padding: '16px 24px' }}
            >
              <span>🚪</span>
              {t('landing_returning')}
            </button>
          </div>

          {/* Admin link */}
          <div style={{ textAlign: 'center', marginTop: 28, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/admin/login')}
            >
              🔐 Administrator Login
            </button>
          </div>
        </div>
      </div>

      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: 16 }}>
        HSE VMS &copy; {new Date().getFullYear()} — Powered by KOMEZUSENGE
      </div>
    </div>
  );
}
