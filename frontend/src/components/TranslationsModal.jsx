import { useState, useEffect } from 'react';
import { questionsAPI } from '../api';
import Spinner from './Spinner';
import toast from 'react-hot-toast';

const LANGS = [['en', 'English'], ['fr', 'Français'], ['rw', 'Kinyarwanda']];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const emptyDraft = (q) => ({ question_text: '', explanation: '', options: q.options.map(() => '') });

/**
 * Review / correct the translations of one question.
 * The original (master) language is read-only here — edit the question itself to change it.
 * Answer options are matched by position, so the correct answer stays correct in every language.
 */
export default function TranslationsModal({ question, onChanged, onClose }) {
  const targets = LANGS.filter(([l]) => l !== question.language);
  const [tab, setTab]       = useState(targets[0]?.[0]);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy]     = useState(false);

  // (Re)load the drafts whenever the saved translations change
  useEffect(() => {
    const next = {};
    for (const [l] of targets) {
      const t = question.translations?.[l];
      next[l] = t && t.question_text ? { question_text: t.question_text, explanation: t.explanation || '', options: [...t.options] } : emptyDraft(question);
    }
    setDrafts(next);
  }, [question]); // eslint-disable-line react-hooks/exhaustive-deps

  const saved = question.translations?.[tab];
  const draft = drafts[tab];
  const setDraft = (patch) => setDrafts((p) => ({ ...p, [tab]: { ...p[tab], ...patch } }));
  const setOption = (i, v) => setDraft({ options: draft.options.map((o, k) => (k === i ? v : o)) });

  const retranslate = async () => {
    setBusy(true);
    try {
      const res = await questionsAPI.translate(question.id, [tab]);
      if (res.data.translation_warning) toast.error(res.data.translation_warning);
      else toast.success('Translated');
      onChanged(res.data.question);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Translation failed');
    } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await questionsAPI.saveTranslation(question.id, tab, draft);
      toast.success('Translation saved');
      onChanged(res.data.question);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save');
    } finally { setBusy(false); }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 680, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '14px 20px', background: 'var(--primary, #1a365d)', color: 'white', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
          <span>🌐 Translations</span>
          <button className="btn btn-ghost btn-sm" style={{ color: 'white' }} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Master copy */}
          <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase' }}>
              Original — {LANGS.find(([l]) => l === question.language)?.[1]}
            </div>
            <div style={{ fontWeight: 600, margin: '4px 0 6px' }}>{question.question_text}</div>
            {question.options.map((o, i) => (
              <div key={o.id} style={{ fontSize: '0.85rem', color: o.is_correct ? 'var(--success)' : 'var(--gray-600)', fontWeight: o.is_correct ? 700 : 400 }}>
                {LETTERS[i]}. {o.option_text} {o.is_correct && '✔'}
              </div>
            ))}
          </div>

          {/* Language tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {targets.map(([l, name]) => {
              const t = question.translations?.[l];
              const ok = t && t.question_text;
              return (
                <button key={l} type="button" onClick={() => setTab(l)}
                  className={`btn btn-sm ${tab === l ? 'btn-primary' : 'btn-ghost'}`}>
                  {name} {ok ? (t.auto ? '🤖' : '✍️') : '⚠️'}
                </button>
              );
            })}
          </div>

          {draft && (
            <>
              {!saved?.question_text && (
                <div className="alert alert-warning" style={{ marginBottom: 12 }}>
                  ⚠️ Not translated yet. Visitors who choose this language see the original text. Click <strong>Translate automatically</strong>.
                </div>
              )}
              {saved?.question_text && (
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 10 }}>
                  {saved.auto ? '🤖 Translated automatically — please check the wording.' : '✍️ Edited by hand.'}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Question</label>
                <textarea rows={2} className="form-input" maxLength={500} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                  value={draft.question_text} onChange={(e) => setDraft({ question_text: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">Answer options</label>
                {draft.options.map((o, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 22, fontWeight: 700, color: question.options[i]?.is_correct ? 'var(--success)' : 'var(--gray-500)' }}>
                      {LETTERS[i]}{question.options[i]?.is_correct ? '✔' : ''}
                    </span>
                    <input className="form-input" style={{ flex: 1 }} maxLength={300} autoComplete="off" value={o}
                      placeholder={question.options[i]?.option_text}
                      onChange={(e) => setOption(i, e.target.value)} />
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">Explanation <span style={{ fontWeight: 400, color: 'var(--gray-400)', fontSize: '0.75rem' }}>(optional)</span></label>
                <textarea rows={2} className="form-input" maxLength={1000} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                  value={draft.explanation} onChange={(e) => setDraft({ explanation: e.target.value })} />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 16 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={retranslate} disabled={busy}>
                  {busy ? <Spinner size="sm" /> : '🔄'} {saved?.question_text ? 'Translate again automatically' : 'Translate automatically'}
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Close</button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>Save translation</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
