import { useState, useEffect } from 'react';
import Spinner from './Spinner';

const PURPOSES  = ['meeting', 'delivery', 'maintenance', 'interview', 'training', 'audit', 'other'];
const ID_TYPES  = [
  ['national_id', 'National ID'], ['passport', 'Passport'],
  ['drivers_license', "Driver's license"], ['company_id', 'Company ID'],
];
const EMPTY = {
  first_name: '', last_name: '', phone: '', email: '', company: '',
  host_name: '', host_department: '', purpose: 'meeting',
  id_type: 'national_id', id_number: '', language: 'en', induction_status: 'pending',
};

// [field, label, required, type]
const TEXT_FIELDS = [
  ['first_name', 'First name', true],
  ['last_name', 'Last name', true],
  ['phone', 'Phone', true, 'tel'],
  ['email', 'Email', false, 'email'],
  ['company', 'Company', true],
  ['host_name', 'Person visited (host)', true],
  ['host_department', 'Host department', false],
  ['id_number', 'ID / passport number', true],
];

/**
 * Add / edit a visitor. Inputs are rendered from a list (NOT from an inner
 * component) so they keep focus while typing.
 */
export default function VisitorFormModal({ open, mode, visitor, saving, onSubmit, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(mode === 'edit' && visitor
      ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, visitor[k] ?? EMPTY[k]]))
      : EMPTY);
  }, [open, mode, visitor]);

  if (!open) return null;

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    for (const [k, label, required] of TEXT_FIELDS) {
      if (required && !String(form[k] || '').trim()) { setError(`${label} is required`); return; }
    }
    setError('');
    onSubmit(form);
  };

  const isEdit = mode === 'edit';

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onCancel?.(); }}
    >
      <form onSubmit={submit} style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '14px 20px', background: 'var(--primary, #1a365d)', color: 'white', fontWeight: 700 }}>
          {isEdit ? `✏️ Edit visitor — ${visitor?.first_name} ${visitor?.last_name}` : '➕ Add visitor'}
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {TEXT_FIELDS.map(([k, label, required, type]) => (
              <div key={k} className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{label}{required && <span className="required-mark"> *</span>}</label>
                <input
                  className="form-input" type={type || 'text'} value={form[k]}
                  onChange={(e) => set(k, e.target.value)} autoComplete="off"
                />
              </div>
            ))}

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Purpose of visit</label>
              <select className="form-select" value={form.purpose} onChange={(e) => set('purpose', e.target.value)}>
                {PURPOSES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">ID type</label>
              <select className="form-select" value={form.id_type} onChange={(e) => set('id_type', e.target.value)}>
                {ID_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Language</label>
              <select className="form-select" value={form.language} onChange={(e) => set('language', e.target.value)}>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="rw">Kinyarwanda</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">HSE induction status</label>
              <select className="form-select" value={form.induction_status} onChange={(e) => set('induction_status', e.target.value)}>
                <option value="pending">Pending</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {isEdit && (
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: 12 }}>
              You will be asked for a reason before the changes are saved.
            </p>
          )}
          {error && <div className="alert alert-danger" style={{ marginTop: 12 }}>⚠ {error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? <Spinner size="sm" /> : null} {isEdit ? 'Continue →' : 'Add visitor'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
