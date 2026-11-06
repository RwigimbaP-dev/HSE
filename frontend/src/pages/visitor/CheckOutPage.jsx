import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import LanguageSelector from '../../components/LanguageSelector';
import StatusBadge from '../../components/StatusBadge';
import Spinner from '../../components/Spinner';
import { visitorAPI } from '../../api';
import toast from 'react-hot-toast';

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function calcDuration(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '—';
  const diffMs = new Date(checkOut) - new Date(checkIn);
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours}h ${minutes}min`;
}

export default function CheckOutPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [visitorData, setVisitorData] = useState(null);
  const [activeVisit, setActiveVisit] = useState(null);
  const [checkedOut, setCheckedOut] = useState(false);
  const [checkOutVisit, setCheckOutVisit] = useState(null);
  const [searching, setSearching] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [step, setStep] = useState('search'); // 'search' | 'confirm' | 'done'

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setSearching(true);
    try {
      const res = await visitorAPI.getByPhone(phone.trim());
      const { visitor, activeVisit: av } = res.data;

      if (!av) {
        toast.error(t('checkout_not_found'));
        return;
      }

      setVisitorData(visitor);
      setActiveVisit(av);
      setStep('confirm');
    } catch (err) {
      const msg = err.response?.data?.message || t('checkout_not_found');
      toast.error(msg);
    } finally {
      setSearching(false);
    }
  };

  const handleCheckOut = async () => {
    setCheckingOut(true);
    try {
      const res = await visitorAPI.checkOut(visitorData.id);
      setCheckOutVisit(res.data.visit);
      setCheckedOut(true);
      setStep('done');
      toast.success(t('checkout_success'));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Check-out failed.');
    } finally {
      setCheckingOut(false);
    }
  };

  const purposeLabel = {
    meeting: t('reg_purpose_meeting'),
    delivery: t('reg_purpose_delivery'),
    maintenance: t('reg_purpose_maintenance'),
    interview: t('reg_purpose_interview'),
    training: t('reg_purpose_training'),
    audit: t('reg_purpose_audit'),
    other: t('reg_purpose_other'),
  };

  return (
    <div className="visitor-page">
      <div className="visitor-header">
        <div className="visitor-logo">🚪</div>
        <h1>{step === 'done' ? t('checkout_success') : t('checkout_title')}</h1>
        <p>{step === 'done' ? t('checkout_success_msg') : t('checkout_subtitle')}</p>
      </div>

      <LanguageSelector />

      <div className="visitor-card" style={{ maxWidth: 580 }}>
        <div className="visitor-card-header">
          <h2 style={{ color: 'white', fontSize: '1rem' }}>
            {step === 'search' && '🔍 ' + t('checkout_find_btn')}
            {step === 'confirm' && '✔ ' + t('checkout_confirm_title')}
            {step === 'done' && '✅ ' + t('checkout_success')}
          </h2>
        </div>

        <div className="visitor-card-body">
          {/* ===== SEARCH STEP ===== */}
          {step === 'search' && (
            <form onSubmit={handleSearch}>
              <div className="form-group">
                <label className="form-label">
                  📞 {t('checkout_phone_label')}
                  <span className="required-mark"> *</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="form-input"
                  placeholder="+250 xxx xxx xxx"
                  autoFocus
                />
              </div>

              <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={searching || !phone.trim()}>
                {searching ? <Spinner size="sm" /> : <span>🔍</span>}
                {t('checkout_find_btn')}
              </button>

              <button type="button" className="btn btn-ghost btn-full" style={{ marginTop: 10 }}
                onClick={() => navigate('/')}>
                ← {t('back')}
              </button>
            </form>
          )}

          {/* ===== CONFIRM STEP ===== */}
          {step === 'confirm' && visitorData && (
            <div>
              <div style={{
                background: '#fff3cd', borderRadius: 10, padding: '12px 16px',
                marginBottom: 20, border: '1px solid #fbd38d',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: '1.5rem' }}>🚪</span>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--warning)' }}>
                  {t('checkout_confirm_msg')}
                </p>
              </div>

              {/* Visitor info */}
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-label">{t('admin_visitor_name')}</div>
                  <div className="detail-value">{visitorData.first_name} {visitorData.last_name}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('reg_company')}</div>
                  <div className="detail-value">{visitorData.company}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('reg_host_name')}</div>
                  <div className="detail-value">{visitorData.host_name}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('reg_purpose')}</div>
                  <div className="detail-value">{purposeLabel[visitorData.purpose] || visitorData.purpose}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('checkin_induction_status')}</div>
                  <div className="detail-value"><StatusBadge status={visitorData.induction_status} type="induction" /></div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('checkin_visit_status')}</div>
                  <div className="detail-value"><StatusBadge status={activeVisit?.status} type="visit" /></div>
                </div>
              </div>

              <div className="detail-item" style={{ marginTop: 12 }}>
                <div className="detail-label">{t('checkout_checkin_time')}</div>
                <div className="detail-value" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                  {formatDateTime(activeVisit?.check_in_time)}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                <button
                  className="btn btn-accent btn-lg btn-full"
                  onClick={handleCheckOut}
                  disabled={checkingOut}
                >
                  {checkingOut ? <Spinner size="sm" /> : <span>🚪</span>}
                  {t('checkout_confirm_btn')}
                </button>
                <button className="btn btn-ghost btn-full" onClick={() => setStep('search')}>
                  ← {t('back')}
                </button>
              </div>
            </div>
          )}

          {/* ===== DONE STEP ===== */}
          {step === 'done' && checkOutVisit && visitorData && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', marginBottom: 16 }}>👋</div>

              <h2 style={{ color: 'var(--success)', marginBottom: 8 }}>
                {t('checkout_success')}
              </h2>
              <p style={{ color: 'var(--gray-500)', marginBottom: 24 }}>
                {t('checkout_success_msg')}
              </p>

              <div className="detail-grid" style={{ marginBottom: 20 }}>
                <div className="detail-item">
                  <div className="detail-label">{t('checkout_checkin_time')}</div>
                  <div className="detail-value">{formatDateTime(checkOutVisit.check_in_time)}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{t('checkout_time')}</div>
                  <div className="detail-value">{formatDateTime(checkOutVisit.check_out_time)}</div>
                </div>
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <div className="detail-label">{t('checkout_duration')}</div>
                  <div className="detail-value" style={{ fontSize: '1.25rem', color: 'var(--primary)', fontWeight: 800 }}>
                    ⏱ {calcDuration(checkOutVisit.check_in_time, checkOutVisit.check_out_time)}
                  </div>
                </div>
              </div>

              <div className="alert alert-success">
                Thank you, <strong>{visitorData.first_name}</strong>! Your visit has been recorded.
              </div>

              <button className="btn btn-primary btn-lg btn-full" onClick={() => navigate('/')}>
                🏠 {t('checkout_done')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
