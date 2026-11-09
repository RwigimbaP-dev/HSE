import { useState, useEffect } from 'react';
import Spinner from './Spinner';

export const MIN_REASON = 5;

/**
 * Confirmation popup that forces the admin to write WHY before an edit or a
 * delete goes through. The reason is saved in the audit log.
 */
export default function ReasonModal({
  open, title, message, confirmLabel = 'Confirm', danger = false,
  loading = false, onConfirm, onCancel, children,
}) {
  const [reason, setReason] = useState('');

  useEffect(() => { if (open) setReason(''); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_REASON;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onCancel?.(); }}
    >
      <div style={{
        background: 'white', borderRadius: 14, width: '100%', maxWidth: 460,
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px', color: 'white', fontWeight: 700,
          background: danger ? 'var(--danger, #c53030)' : 'var(--primary, #1a365d)',
        }}>
          {danger ? '🗑️' : '✏️'} {title}
        </div>

        <div style={{ padding: 20 }}>
          {message && <p style={{ fontSize: '0.9rem', color: 'var(--gray-600)', marginBottom: 12, lineHeight: 1.5 }}>{message}</p>}
          {children}

          <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>
            Reason <span className="required-mark">*</span>
          </label>
          <textarea
            autoFocus
            rows={3}
            className="form-input"
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Why are you doing this? (saved in the audit log)"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
          />
          <div style={{ fontSize: '0.75rem', marginTop: 4, color: valid ? 'var(--gray-400)' : 'var(--warning, #b7791f)' }}>
            {valid ? `${trimmed.length}/1000` : `At least ${MIN_REASON} characters required`}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={loading}>Cancel</button>
            <button
              type="button"
              className={`btn btn-sm ${danger ? 'btn-accent' : 'btn-primary'}`}
              style={danger ? { background: 'var(--danger, #c53030)', color: 'white', borderColor: 'var(--danger, #c53030)' } : undefined}
              onClick={() => onConfirm(trimmed)}
              disabled={!valid || loading}
            >
              {loading ? <Spinner size="sm" /> : null} {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
