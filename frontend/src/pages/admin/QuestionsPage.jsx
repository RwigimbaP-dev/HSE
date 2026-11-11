import { useState, useEffect, useCallback } from 'react';
import { questionsAPI } from '../../api';
import Spinner from '../../components/Spinner';
import ReasonModal from '../../components/ReasonModal';
import QuestionFormModal from '../../components/QuestionFormModal';
import TranslationsModal from '../../components/TranslationsModal';
import toast from 'react-hot-toast';

const LANG_LABEL = { all: 'Language not set', en: 'English', fr: 'Français', rw: 'Kinyarwanda' };
const WRITTEN_IN = ['en', 'fr', 'rw'];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function QuestionsPage() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filters, setFilters]     = useState({ search: '', language: '', active: '' });
  const [search, setSearch]       = useState('');

  const [settings, setSettings]   = useState(null);          // from the server
  const [countInput, setCountInput] = useState('5');
  const [passInput, setPassInput]   = useState('80');
  const [savingSettings, setSavingSettings] = useState(false);

  const [formModal, setFormModal]     = useState(null);      // { question } — question null = new
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy]               = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationsFor, setTranslationsFor] = useState(null); // question being reviewed

  // debounce search
  useEffect(() => {
    const id = setTimeout(() => setSearch(filters.search), 350);
    return () => clearTimeout(id);
  }, [filters.search]);

  const loadSettings = useCallback(async () => {
    try {
      const res = await questionsAPI.getSettings();
      setSettings(res.data);
      setCountInput(String(res.data.question_count));
      setPassInput(String(res.data.pass_score));
    } catch { /* shown as empty */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filters.language) params.language = filters.language;
      if (filters.active) params.active = filters.active;
      const res = await questionsAPI.getAll(params);
      setQuestions(res.data.questions);
    } catch {
      toast.error('Failed to load questions');
    } finally { setLoading(false); }
  }, [search, filters.language, filters.active]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSettings(); }, [loadSettings]);

  // ── actions ────────────────────────────────────────────────────────────────
  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await questionsAPI.updateSettings(parseInt(countInput, 10), parseInt(passInput, 10));
      toast.success('Quiz settings saved');
      loadSettings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save');
    } finally { setSavingSettings(false); }
  };

  const handleSubmit = async (payload) => {
    setBusy(true);
    try {
      const res = formModal.question
        ? await questionsAPI.update(formModal.question.id, payload)
        : await questionsAPI.create(payload);
      toast.success(formModal.question ? 'Question updated' : 'Question added');
      if (res.data.translated?.length) toast.success(`🌐 Translated into ${res.data.translated.map((l) => LANG_LABEL[l]).join(' and ')}`, { duration: 5000 });
      if (res.data.translation_warning) {
        toast(`⚠️ Saved, but not translated: ${res.data.translation_warning}`, { duration: 10000 });
      }
      setFormModal(null);
      load(); loadSettings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save the question');
    } finally { setBusy(false); }
  };

  const translateAll = async () => {
    setTranslating(true);
    try {
      const res = await questionsAPI.translateMissing();
      if (res.data.translated) toast.success(`🌐 ${res.data.translated} translation(s) created`);
      if (res.data.message) toast.error(res.data.message, { duration: 10000 });
      if (res.data.remaining > 0 && !res.data.message) toast(`${res.data.remaining} more to translate — click again to continue`);
      load(); loadSettings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Translation failed');
    } finally { setTranslating(false); }
  };

  // The translations modal saved something: refresh the list and keep the modal on the fresh data
  const handleTranslationChanged = (updated) => {
    setTranslationsFor(updated);
    setQuestions((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    loadSettings();
  };

  const handleToggle = async (q) => {
    try {
      await questionsAPI.toggle(q.id);
      load(); loadSettings();
    } catch { toast.error('Could not update the question'); }
  };

  const confirmDelete = async (reason) => {
    setBusy(true);
    try {
      await questionsAPI.remove(deleteTarget.id, reason);
      toast.success('Question deleted');
      setDeleteTarget(null);
      load(); loadSettings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete');
    } finally { setBusy(false); }
  };

  // ── settings warnings ──────────────────────────────────────────────────────
  const count = parseInt(countInput, 10);
  const shortLangs = settings && settings.active_total > 0
    ? ['en', 'fr', 'rw'].filter((l) => settings.available[l] < count)
    : [];

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--gray-800)' }}>❓ Quiz Questions</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginTop: 2 }}>
            Write the questions and answers visitors see in the safety quiz.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setFormModal({ question: null })}>➕ Add question</button>
      </div>

      {/* Quiz settings */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--gray-800)' }}>⚙️ Quiz settings</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: 2 }}>
              Each visitor gets this many questions, picked at random from the active questions below.
            </div>
          </div>
          <div>
            <label className="filter-label">Questions per quiz</label>
            <input type="number" min="1" max="50" className="form-input" style={{ width: 110 }}
              value={countInput} onChange={(e) => setCountInput(e.target.value)} />
          </div>
          <div>
            <label className="filter-label">Pass mark (%)</label>
            <input type="number" min="1" max="100" className="form-input" style={{ width: 110 }}
              value={passInput} onChange={(e) => setPassInput(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={saveSettings} disabled={savingSettings}>
            {savingSettings ? 'Saving…' : 'Save'}
          </button>
        </div>

        {settings && (
          <div style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--gray-500)' }}>
            Active questions in the quiz bank: <strong>{settings.active_total}</strong> — shown to visitors in English, Français and Kinyarwanda.
          </div>
        )}
        {settings?.translator && (
          <div style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--gray-500)' }}>
            🌐 Automatic translation: <strong>{settings.translator.label}</strong> — {settings.translator.note}
          </div>
        )}
        {settings && settings.untranslated > 0 && (
          <div className="alert alert-warning" style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}>⚠️ {settings.untranslated} question(s) are not fully translated. Visitors in the missing language see the original text.</span>
            <button className="btn btn-primary btn-sm" onClick={translateAll} disabled={translating}>
              {translating ? 'Translating…' : '🌐 Translate all missing'}
            </button>
          </div>
        )}
        {settings && settings.language_not_set > 0 && (
          <div className="alert alert-info" style={{ marginTop: 10 }}>
            ℹ️ {settings.language_not_set} older question(s) have no language set. Click ✏️ on them, choose the language they are written in, and save — they will then be translated.
          </div>
        )}
        {settings && settings.active_total === 0 && (
          <div className="alert alert-info" style={{ marginTop: 10 }}>
            ℹ️ No active questions yet, so visitors currently get the built-in questions. Add your own and they replace them.
          </div>
        )}
        {shortLangs.length > 0 && (
          <div className="alert alert-warning" style={{ marginTop: 10 }}>
            ⚠️ Not enough questions for the quiz length ({count}) in: {shortLangs.map((l) => LANG_LABEL[l]).join(', ')}.
            Visitors in those languages will get only the questions available.
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="filter-group" style={{ flex: 2 }}>
          <label className="filter-label">🔍 Search</label>
          <input className="filter-input" placeholder="Search in questions…" value={filters.search}
            onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} />
        </div>
        <div className="filter-group">
          <label className="filter-label">Written in</label>
          <select className="filter-select" value={filters.language} onChange={(e) => setFilters((p) => ({ ...p, language: e.target.value }))}>
            <option value="">All</option>
            {WRITTEN_IN.map((v) => <option key={v} value={v}>{LANG_LABEL[v]}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Status</label>
          <select className="filter-select" value={filters.active} onChange={(e) => setFilters((p) => ({ ...p, active: e.target.value }))}>
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Switched off</option>
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex-center" style={{ padding: '48px 0', flexDirection: 'column', gap: 12 }}>
          <Spinner size="lg" />
        </div>
      ) : questions.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)' }}>
          <div style={{ fontSize: '2rem' }}>❓</div>
          <p style={{ marginTop: 8 }}>No questions found. Click <strong>Add question</strong> to write your first one.</p>
        </div>
      ) : (
        questions.map((q, idx) => (
          <div key={q.id} className="card" style={{ padding: '14px 18px', marginBottom: 12, opacity: q.is_active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 700 }}>#{questions.length - idx}</span>
                  <span className="badge badge-in" title="The language this question was written in">✍️ {LANG_LABEL[q.language] || q.language}</span>
                  {WRITTEN_IN.some((l) => l === q.language) && WRITTEN_IN.filter((l) => l !== q.language).map((l) => {
                    const t = q.translations?.[l];
                    const ok = t && t.question_text && !(q.missing_translations || []).includes(l);
                    return (
                      <span key={l} className={`badge ${ok ? 'badge-passed' : 'badge-pending'}`}
                        title={ok ? (t.auto ? 'Translated automatically' : 'Edited by hand') : 'Not translated yet'}>
                        {l.toUpperCase()} {ok ? '✓' : '⚠'}
                      </span>
                    );
                  })}
                  <span className={`badge ${q.is_active ? 'badge-passed' : 'badge-na'}`}>{q.is_active ? 'Active' : 'Switched off'}</span>
                </div>
                <div style={{ fontWeight: 600, color: 'var(--gray-800)', marginBottom: 8 }}>{q.question_text}</div>
                <div>
                  {q.options.map((o, i) => (
                    <div key={o.id} style={{
                      fontSize: '0.85rem', padding: '4px 10px', marginBottom: 4, borderRadius: 8,
                      background: o.is_correct ? 'var(--success-bg, #f0fff4)' : 'var(--gray-50)',
                      color: o.is_correct ? 'var(--success, #276749)' : 'var(--gray-700)',
                      fontWeight: o.is_correct ? 700 : 400,
                    }}>
                      {LETTERS[i]}. {o.option_text} {o.is_correct && '✔'}
                    </div>
                  ))}
                </div>
                {q.explanation && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: 6 }}>💡 {q.explanation}</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <button className="btn btn-ghost btn-sm" title={q.is_active ? 'Switch off' : 'Switch on'} onClick={() => handleToggle(q)}>
                  {q.is_active ? '⏸' : '▶'}
                </button>
                {WRITTEN_IN.includes(q.language) && (
                  <button className="btn btn-ghost btn-sm" title="Translations" onClick={() => setTranslationsFor(q)}>🌐</button>
                )}
                <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setFormModal({ question: q })}>✏️</button>
                <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => setDeleteTarget(q)}>🗑️</button>
              </div>
            </div>
          </div>
        ))
      )}

      <QuestionFormModal
        open={!!formModal}
        question={formModal?.question}
        saving={busy}
        onSubmit={handleSubmit}
        onCancel={() => setFormModal(null)}
      />

      {translationsFor && (
        <TranslationsModal
          question={translationsFor}
          onChanged={handleTranslationChanged}
          onClose={() => { setTranslationsFor(null); load(); }}
        />
      )}

      <ReasonModal
        open={!!deleteTarget}
        danger
        title="Delete question"
        message={deleteTarget ? `Delete this question and all its answer options?\n\n“${deleteTarget.question_text}”` : ''}
        confirmLabel="Delete question"
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
