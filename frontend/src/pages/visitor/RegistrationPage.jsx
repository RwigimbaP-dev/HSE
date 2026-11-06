import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useVisitor } from '../../context/VisitorContext';
import LanguageSelector from '../../components/LanguageSelector';
import ProgressBar from '../../components/ProgressBar';
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

export default function RegistrationPage() {
  const { t, language } = useLanguage();
  const { saveToken } = useVisitor();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    company: '', id_type: 'national_id', id_number: '',
    host_name: '', host_department: '', purpose: 'meeting',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validate = () => {
    const newErrors = {};
    if (!form.first_name.trim()) newErrors.first_name = t('required');
    if (!form.last_name.trim()) newErrors.last_name = t('required');
    if (!form.phone.trim()) newErrors.phone = t('required');
    else if (!/^\+?[\d\s\-]{7,15}$/.test(form.phone.trim())) newErrors.phone = 'Invalid phone number';
    if (!form.company.trim()) newErrors.company = t('required');
    if (!form.id_number.trim()) newErrors.id_number = t('required');
    if (!form.host_name.trim()) newErrors.host_name = t('required');
    if (!form.purpose) newErrors.purpose = t('required');
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      toast.error('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      const res = await visitorAPI.register({ ...form, language });
      const { visitor, visitorToken } = res.data;

      // Store the visitor session token — it will be sent automatically
      // on all subsequent API calls via the X-Visitor-Token header
      if (visitorToken) saveToken(visitorToken);

      toast.success(t('reg_success'));
      navigate('/visitor/induction', { state: { visitor } });
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed. Please try again.';
      if (err.response?.data?.code === 'ALREADY_CHECKED_IN') {
        toast.error(t('reg_already_in'));
        setTimeout(() => navigate('/visitor/checkout'), 2000);
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ name, label, required, type = 'text', hint, children }) => (
    <div className="form-group">
      <label className="form-label">
        {label}
        {required && <span className="required-mark"> *</span>}
      </label>
      {children || (
        <input
          type={type}
          name={name}
          value={form[name]}
          onChange={handleChange}
          className={`form-input ${errors[name] ? 'error' : ''}`}
          style={errors[name] ? { borderColor: 'var(--danger)' } : {}}
          autoComplete="off"
        />
      )}
      {errors[name] && <span className="form-error">⚠ {errors[name]}</span>}
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  );

  return (
    <div className="visitor-page">
      <div className="visitor-header">
        <div className="visitor-logo">🏢</div>
        <h1>{t('reg_title')}</h1>
        <p>{t('reg_subtitle')}</p>
      </div>

      <LanguageSelector />

      <div className="visitor-card">
        <div className="visitor-card-header">
          <ProgressBar steps={getSteps(language)} current={1} />
        </div>

        <div className="visitor-card-body">
          <form onSubmit={handleSubmit} noValidate>
            {/* Personal info */}
            <div className="section-title">
              <span style={{ fontSize: '1.2rem' }}>👤</span>
              <h3>{t('reg_personal')}</h3>
            </div>

            <div className="form-grid">
              <Field name="first_name" label={t('reg_first_name')} required />
              <Field name="last_name" label={t('reg_last_name')} required />
            </div>

            <div className="form-grid">
              <Field name="phone" label={t('reg_phone')} required type="tel"
                hint="+250 or local format" />
              <Field name="email" label={t('reg_email')} type="email" />
            </div>

            <Field name="company" label={t('reg_company')} required />

            <div className="form-grid">
              <Field name="id_type" label={t('reg_id_type')} required>
                <select name="id_type" value={form.id_type} onChange={handleChange} className="form-select">
                  <option value="national_id">{t('reg_id_national')}</option>
                  <option value="passport">{t('reg_id_passport')}</option>
                  <option value="drivers_license">{t('reg_id_driver')}</option>
                  <option value="company_id">{t('reg_id_company')}</option>
                </select>
              </Field>
              <Field name="id_number" label={t('reg_id_number')} required />
            </div>

            <div className="section-divider" />

            {/* Visit info */}
            <div className="section-title">
              <span style={{ fontSize: '1.2rem' }}>📋</span>
              <h3>{t('reg_visit_info')}</h3>
            </div>

            <Field name="host_name" label={t('reg_host_name')} required />
            <Field name="host_department" label={t('reg_host_dept')} />

            <Field name="purpose" label={t('reg_purpose')} required>
              <select name="purpose" value={form.purpose} onChange={handleChange} className="form-select">
                <option value="meeting">{t('reg_purpose_meeting')}</option>
                <option value="delivery">{t('reg_purpose_delivery')}</option>
                <option value="maintenance">{t('reg_purpose_maintenance')}</option>
                <option value="interview">{t('reg_purpose_interview')}</option>
                <option value="training">{t('reg_purpose_training')}</option>
                <option value="audit">{t('reg_purpose_audit')}</option>
                <option value="other">{t('reg_purpose_other')}</option>
              </select>
            </Field>

            <div style={{ marginTop: 24 }}>
              <button
                type="submit"
                className="btn btn-primary btn-lg btn-full"
                disabled={loading}
              >
                {loading ? <Spinner size="sm" /> : <span>▶</span>}
                {t('reg_submit')}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-full"
                style={{ marginTop: 10 }}
                onClick={() => navigate('/')}
              >
                ← {t('back')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
