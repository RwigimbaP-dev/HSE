import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import ProgressBar from '../../components/ProgressBar';
import StatusBadge from '../../components/StatusBadge';
import Spinner from '../../components/Spinner';
import { visitorAPI } from '../../api';
import toast from 'react-hot-toast';

const STEPS_EN = ['Register', 'HSE Video', 'Assessment', 'Check-In'];
const STEPS_FR = ['Inscription', 'Vidéo HSE', 'Évaluation', 'Entrée'];
const STEPS_RW = ['Kwiyandikisha', 'Videwo', 'Ikizami', 'Kwinjira'];
function getSteps(lang) {
  if (lang === 'fr') return STEPS_FR;
  if (lang === 'rw') return STEPS_RW;
  return STEPS_EN;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function calcDuration(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const diff = Math.floor((new Date(checkOut) - new Date(checkIn)) / 60000);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}

export default function CheckInPage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const visitor = location.state?.visitor;

  // Stages: 'confirm' → 'checkedin' → 'checkedout'
  const [stage, setStage]           = useState('confirm');
  const [visit, setVisit]           = useState(null);
  const [checkOutVisit, setCheckOutVisit] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    if (!visitor) navigate('/visitor/register');
    else if (visitor.induction_status !== 'passed') navigate('/visitor/quiz', { state: { visitor } });
  }, [visitor, navigate]);

  // ── Check-in ──────────────────────────────────────────────────────────────
  const handleCheckIn = async () => {
    setLoading(true);
    try {
      const res = await visitorAPI.checkIn(visitor.id);
      setVisit(res.data.visit);
      setStage('checkedin');
      toast.success(t('checkin_success'));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Check-in failed.');
    } finally {
      setLoading(false);
    }
  };

  // ── Check-out from this screen ────────────────────────────────────────────
  const handleCheckOut = async () => {
    setCheckingOut(true);
    try {
      const res = await visitorAPI.checkOut(visitor.id);
      setCheckOutVisit(res.data.visit);
      setStage('checkedout');
      toast.success(t('checkout_success'));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Check-out failed.');
    } finally {
      setCheckingOut(false);
    }
  };

  const handlePrint = () => window.print();

  if (!visitor) return null;

  const purposeLabel = {
    meeting:     t('reg_purpose_meeting'),
    delivery:    t('reg_purpose_delivery'),
    maintenance: t('reg_purpose_maintenance'),
    interview:   t('reg_purpose_interview'),
    training:    t('reg_purpose_training'),
    audit:       t('reg_purpose_audit'),
    other:       t('reg_purpose_other'),
  }[visitor.purpose] || visitor.purpose;

  const idTypeLabel = {
    national_id:    t('reg_id_national'),
    passport:       t('reg_id_passport'),
    drivers_license: t('reg_id_driver'),
    company_id:     t('reg_id_company'),
  }[visitor.id_type] || visitor.id_type;

  return (
    <div className="visitor-page">
      <div className="visitor-header">
        <div className="visitor-logo">
          {stage === 'confirm'    && '🪪'}
          {stage === 'checkedin'  && '✅'}
          {stage === 'checkedout' && '👋'}
        </div>
        <h1>
          {stage === 'confirm'    && t('checkin_title')}
          {stage === 'checkedin'  && t('checkin_success')}
          {stage === 'checkedout' && t('checkout_success')}
        </h1>
        <p>
          {stage === 'confirm'    && t('checkin_subtitle')}
          {stage === 'checkedin'  && t('checkin_success_msg')}
          {stage === 'checkedout' && t('checkout_success_msg')}
        </p>
      </div>

      <div className="visitor-card">
        {stage === 'confirm' && (
          <div className="visitor-card-header">
            <ProgressBar steps={getSteps(language)} current={4} />
          </div>
        )}

        <div className="visitor-card-body">

          {/* ══════════════ CONFIRM CHECK-IN ══════════════ */}
          {stage === 'confirm' && (
            <div>
              {/* Induction passed banner */}
              <div style={{
                background: 'linear-gradient(135deg, #f0fff4, #e6ffed)',
                borderRadius: 12, padding: '16px 20px', marginBottom: 20,
                border: '1.5px solid #9ae6b4',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: '1.8rem' }}>✅</span>
                <div>
                  <p style={{ fontWeight: 700, color: 'var(--success)', fontSize: '0.95rem' }}>
                    HSE Induction {t('checkin_passed')}
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                    Score: {visitor.quiz_score}% — You are cleared to enter
                  </p>
                </div>
              </div>

              <div className="section-title">
                <span>👤</span>
                <h3>{t('checkin_visitor_details')}</h3>
              </div>

              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-label">{t('reg_first_name')}</div>
                  <div className="detail-value">{visitor.first_name}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('reg_last_name')}</div>
                  <div className="detail-value">{visitor.last_name}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('reg_company')}</div>
                  <div className="detail-value">{visitor.company}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('admin_phone')}</div>
                  <div className="detail-value">{visitor.phone}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('reg_host_name')}</div>
                  <div className="detail-value">{visitor.host_name}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('reg_purpose')}</div>
                  <div className="detail-value">{purposeLabel}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('reg_id_type')}</div>
                  <div className="detail-value">{idTypeLabel}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('reg_id_number')}</div>
                  <div className="detail-value">{visitor.id_number}</div>
                </div>
              </div>

              <div style={{
                background: 'var(--info-bg)', borderRadius: 10, padding: '12px 16px',
                marginTop: 16, marginBottom: 20, border: '1px solid #bee3f8',
                fontSize: '0.875rem', color: 'var(--info)',
              }}>
                ℹ️ By confirming check-in, your entry will be recorded with the current date and time.
              </div>

              <button className="btn btn-success btn-lg btn-full" onClick={handleCheckIn} disabled={loading}>
                {loading ? <Spinner size="sm" /> : <span>✓</span>}
                {t('checkin_confirm_btn')}
              </button>
            </div>
          )}

          {/* ══════════════ CHECKED IN ══════════════ */}
          {stage === 'checkedin' && (
            <div>
              {/* Visitor badge card */}
              <div className="badge-card">
                <div className="badge-check-icon">🎫</div>
                <div className="badge-card-title">{t('checkin_badge')}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, margin: '8px 0' }}>
                  {visitor.first_name} {visitor.last_name}
                </div>
                <div className="badge-card-sub">{visitor.company} → {visitor.host_name}</div>
                <div style={{ marginTop: 12, fontSize: '0.8rem', opacity: 0.75 }}>
                  {t('checkin_check_in_time')}: {formatDateTime(visit?.check_in_time)}
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700 }}>
                    {t('checkin_status_in')}
                  </span>
                </div>
              </div>

              <div className="alert alert-success" style={{ marginTop: 16 }}>
                🛡️ {t('checkin_welcome')} {t('checkin_instructions')}
              </div>

              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-label">{t('checkin_induction_status')}</div>
                  <div className="detail-value"><StatusBadge status="passed" type="induction" /></div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('checkin_visit_status')}</div>
                  <div className="detail-value"><StatusBadge status="IN" type="visit" /></div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('admin_phone')}</div>
                  <div className="detail-value">{visitor.phone}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('reg_purpose')}</div>
                  <div className="detail-value">{purposeLabel}</div>
                </div>
              </div>

              {/* ── Action buttons ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                {/* CHECK OUT button — prominent */}
                <button
                  className="btn btn-accent btn-lg btn-full"
                  onClick={handleCheckOut}
                  disabled={checkingOut}
                  style={{ fontWeight: 700 }}
                >
                  {checkingOut ? <Spinner size="sm" /> : <span>🚪</span>}
                  {t('checkout_confirm_btn')}
                </button>

                <button className="btn btn-outline btn-full" onClick={handlePrint}>
                  🖨️ {t('checkin_print_badge')}
                </button>

                <button className="btn btn-ghost btn-full" onClick={() => navigate('/')}>
                  🏠 {t('checkin_done')}
                </button>
              </div>
            </div>
          )}

          {/* ══════════════ CHECKED OUT ══════════════ */}
          {stage === 'checkedout' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', marginBottom: 16 }}>👋</div>

              <h2 style={{ color: 'var(--success)', marginBottom: 8 }}>
                {t('checkout_success')}
              </h2>
              <p style={{ color: 'var(--gray-500)', marginBottom: 24 }}>
                {t('checkout_success_msg')}
              </p>

              {/* Visit summary */}
              <div className="detail-grid" style={{ marginBottom: 20, textAlign: 'left' }}>
                <div className="detail-item">
                  <div className="detail-label">{t('checkout_checkin_time')}</div>
                  <div className="detail-value">{formatDateTime(checkOutVisit?.check_in_time)}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('checkout_time')}</div>
                  <div className="detail-value">{formatDateTime(checkOutVisit?.check_out_time)}</div>
                </div>
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <div className="detail-label">{t('checkout_duration')}</div>
                  <div className="detail-value" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>
                    ⏱ {calcDuration(checkOutVisit?.check_in_time, checkOutVisit?.check_out_time) || '—'}
                  </div>
                </div>
              </div>

              <div className="alert alert-success" style={{ textAlign: 'left' }}>
                Thank you, <strong>{visitor.first_name}</strong>! Your visit has been recorded.
              </div>

              {/* Go home */}
              <button
                className="btn btn-primary btn-lg btn-full"
                style={{ marginTop: 20 }}
                onClick={() => navigate('/')}
              >
                🏠 {t('checkout_done')}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
