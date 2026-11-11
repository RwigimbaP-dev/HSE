const express = require('express');
const router  = express.Router();
const { db }  = require('../database/schema');
const { authenticateAdmin } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { getQuizSettings, saveSetting } = require('../utils/quizSettings');
const translator = require('../utils/translator');

router.use(authenticateAdmin); // every route here is admin-only

const LANGS = ['en', 'fr', 'rw'];          // languages a question can be written in / translated to
const LEGACY = 'all';                       // old questions that were never given a language
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

// ─── Validation ──────────────────────────────────────────────────────────────
function cleanQuestion(body) {
  const language = LANGS.includes(body.language) ? body.language : null;
  if (!language) return { error: 'Choose the language this question is written in.' };
  const question_text = String(body.question_text || '').trim();
  if (question_text.length < 5)   return { error: 'The question must be at least 5 characters long.' };
  if (question_text.length > 500) return { error: 'The question is too long (500 characters max).' };

  const explanation = String(body.explanation || '').trim().slice(0, 1000);

  const raw = Array.isArray(body.options) ? body.options : [];
  const options = raw
    .map((o) => ({ option_text: String(o.option_text ?? o.text ?? '').trim(), is_correct: !!o.is_correct }))
    .filter((o) => o.option_text);

  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
    return { error: `Add between ${MIN_OPTIONS} and ${MAX_OPTIONS} answer options.` };
  }
  if (options.some((o) => o.option_text.length > 300)) return { error: 'An answer option is too long (300 characters max).' };

  const seen = new Set();
  for (const o of options) {
    const k = o.option_text.toLowerCase();
    if (seen.has(k)) return { error: 'Two answer options are identical — each option must be different.' };
    seen.add(k);
  }
  if (options.filter((o) => o.is_correct).length !== 1) {
    return { error: 'Mark exactly ONE option as the correct answer.' };
  }

  return {
    data: { language, question_text, explanation, is_active: body.is_active !== false },
    options,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function loadQuestions(filter = {}) {
  let q = db('quiz_questions');
  if (filter.id)       q = q.where({ id: filter.id });
  if (filter.language) q = q.where({ language: filter.language });
  if (filter.active === 'true')  q = q.where({ is_active: true });
  if (filter.active === 'false') q = q.where({ is_active: false });
  if (filter.search)   q = q.where('question_text', 'ilike', `%${filter.search}%`);
  const questions = await q.orderBy('created_at', 'desc').orderBy('id', 'desc');
  if (questions.length === 0) return [];

  const options = await db('quiz_options')
    .whereIn('question_id', questions.map((x) => x.id))
    .orderBy('sort_order', 'asc').orderBy('id', 'asc');
  const by = {};
  for (const o of options) (by[o.question_id] ||= []).push(o);
  return questions.map((x) => {
    let translations = {};
    try { translations = x.translations ? JSON.parse(x.translations) : {}; } catch { translations = {}; }
    return { ...x, translations, options: by[x.id] || [] };
  });
}

const snapshot = (q) => ({
  language: q.language,
  question_text: q.question_text,
  explanation: q.explanation || '',
  is_active: !!q.is_active,
  options: q.options.map((o) => `${o.is_correct ? '✔ ' : ''}${o.option_text}`),
});

const sourceOf = (q) => ({
  language: q.language,
  question_text: q.question_text,
  explanation: q.explanation || '',
  options: q.options.map((o) => `${o.is_correct ? '1' : '0'}${o.option_text}`),
});

const label = (text) => (text.length > 80 ? `${text.slice(0, 77)}…` : text);

// ─── Translation helpers ─────────────────────────────────────────────────────
// Languages a question still needs a translation for (its own language is the master copy).
function missingLanguages(q) {
  if (!LANGS.includes(q.language)) return [];              // old "all" questions: language unknown
  return LANGS.filter((l) => l !== q.language).filter((l) => {
    const t = q.translations?.[l];
    return !(t && t.question_text && Array.isArray(t.options) && t.options.length === q.options.length && t.options.every(Boolean));
  });
}

/**
 * Translate a saved question into `languages` and store the result.
 * With `fresh` the old translations are dropped first (used when the master text changed).
 * Returns { done: [lang], failed: [{ language, message }] }.
 */
async function autoTranslate(questionId, languages, { fresh = false } = {}) {
  const [q] = await loadQuestions({ id: questionId });
  if (!q || !LANGS.includes(q.language)) return { done: [], failed: [] };

  const translations = fresh ? {} : { ...(q.translations || {}) };
  delete translations[q.language];                         // the master copy is never stored as a translation
  const source = { question_text: q.question_text, explanation: q.explanation || '', options: q.options.map((o) => o.option_text) };

  const done = [];
  const failed = [];
  for (const lang of languages.filter((l) => LANGS.includes(l) && l !== q.language)) {
    try {
      const t = await translator.translateQuestion(source, q.language, lang);
      translations[lang] = { ...t, auto: true, at: new Date().toISOString() };
      done.push(lang);
    } catch (err) {
      failed.push({ language: lang, message: err.message });
    }
  }
  await db('quiz_questions').where({ id: q.id }).update({ translations: JSON.stringify(translations) });
  return { done, failed };
}

const failureNote = (failed) => failed.map((f) => `${translator.LANG_NAMES[f.language]}: ${f.message}`).join(' · ');

// ─── GET /api/questions ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search, language, active } = req.query;
    const questions = await loadQuestions({
      search: search ? String(search).slice(0, 100) : undefined,
      language: LANGS.includes(language) ? language : undefined,
      active,
    });
    res.json({ success: true, questions: questions.map((q) => ({ ...q, missing_translations: missingLanguages(q) })), total: questions.length });
  } catch (err) {
    console.error('List questions error:', err);
    res.status(500).json({ success: false, message: 'Could not load questions' });
  }
});

// ─── GET /api/questions/settings ─────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const settings = await getQuizSettings();
    const all = await loadQuestions({});
    const active = all.filter((q) => q.is_active);
    // Every active question can be shown in every language (translated, or in its original language)
    const available = { en: active.length, fr: active.length, rw: active.length };
    res.json({
      success: true, ...settings, available, active_total: active.length,
      untranslated: all.filter((q) => missingLanguages(q).length > 0).length,
      language_not_set: all.filter((q) => !LANGS.includes(q.language)).length,
      translator: translator.providerInfo(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not load settings' });
  }
});

// ─── PUT /api/questions/settings ─────────────────────────────────────────────
router.put('/settings', async (req, res) => {
  try {
    const count = parseInt(req.body.question_count, 10);
    const pass  = parseInt(req.body.pass_score, 10);
    if (!Number.isFinite(count) || count < 1 || count > 50) {
      return res.status(400).json({ success: false, message: 'Number of questions must be between 1 and 50.' });
    }
    if (!Number.isFinite(pass) || pass < 1 || pass > 100) {
      return res.status(400).json({ success: false, message: 'Pass mark must be between 1 and 100.' });
    }
    const before = await getQuizSettings();
    await saveSetting('quiz_question_count', count);
    await saveSetting('quiz_pass_score', pass);
    await audit(req, {
      action: 'settings.update', category: 'system', entity_type: 'setting', entity_label: 'Quiz length and pass mark',
      before, after: { question_count: count, pass_score: pass },
    });
    res.json({ success: true, question_count: count, pass_score: pass });
  } catch (err) {
    console.error('Save quiz settings error:', err);
    res.status(500).json({ success: false, message: 'Could not save settings' });
  }
});

// ─── POST /api/questions — create ────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { data, options, error } = cleanQuestion(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const id = await db.transaction(async (trx) => {
      const [row] = await trx('quiz_questions').insert({ ...data, created_by: req.admin.id }).returning('id');
      const qid = row?.id ?? row;
      await trx('quiz_options').insert(options.map((o, i) => ({ ...o, question_id: qid, sort_order: i })));
      return qid;
    });

    let result = { done: [], failed: [] };
    if (req.body.auto_translate !== false) result = await autoTranslate(id, LANGS);

    const [question] = await loadQuestions({ id });
    await audit(req, {
      action: 'question.create', category: 'quiz', entity_type: 'quiz_question', entity_id: id,
      entity_label: label(question.question_text), after: { ...snapshot(question), translated_to: result.done },
    });
    res.json({
      success: true,
      question: { ...question, missing_translations: missingLanguages(question) },
      translated: result.done,
      translation_warning: result.failed.length ? failureNote(result.failed) : null,
    });
  } catch (err) {
    console.error('Create question error:', err);
    res.status(500).json({ success: false, message: 'Could not save the question' });
  }
});

// ─── PUT /api/questions/:id — edit question and its options ──────────────────
router.put('/:id', async (req, res) => {
  try {
    const [existing] = await loadQuestions({ id: req.params.id });
    if (!existing) return res.status(404).json({ success: false, message: 'Question not found' });

    const { data, options, error } = cleanQuestion(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    await db.transaction(async (trx) => {
      await trx('quiz_questions').where({ id: existing.id }).update({ ...data, updated_at: new Date().toISOString() });
      await trx('quiz_options').where({ question_id: existing.id }).delete();
      await trx('quiz_options').insert(options.map((o, i) => ({ ...o, question_id: existing.id, sort_order: i })));
    });

    let [question] = await loadQuestions({ id: existing.id });

    // The master text changed → the old translations are now wrong, so translate again
    let result = { done: [], failed: [] };
    const masterChanged = JSON.stringify(sourceOf(existing)) !== JSON.stringify(sourceOf(question));
    if (masterChanged) {
      if (req.body.auto_translate !== false) {
        result = await autoTranslate(existing.id, LANGS, { fresh: true });
      } else {
        await db('quiz_questions').where({ id: existing.id }).update({ translations: null });
      }
      [question] = await loadQuestions({ id: existing.id });
    }

    const before = snapshot(existing);
    const after  = snapshot(question);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await audit(req, {
        action: 'question.update', category: 'quiz', entity_type: 'quiz_question', entity_id: existing.id,
        entity_label: label(question.question_text), before, after,
        details: masterChanged ? { retranslated: result.done } : undefined,
      });
    }
    res.json({
      success: true,
      question: { ...question, missing_translations: missingLanguages(question) },
      translated: result.done,
      translation_warning: result.failed.length ? failureNote(result.failed) : null,
    });
  } catch (err) {
    console.error('Update question error:', err);
    res.status(500).json({ success: false, message: 'Could not update the question' });
  }
});

// ─── GET /api/questions/translation-status ───────────────────────────────────
router.get('/translation-status', (req, res) => {
  res.json({ success: true, ...translator.providerInfo() });
});

// ─── POST /api/questions/translate-missing — translate every question that lacks a translation ──
router.post('/translate-missing', async (req, res) => {
  try {
    const all = (await loadQuestions({})).filter((q) => missingLanguages(q).length > 0);
    const batch = all.slice(0, 15); // keep each request short
    let translated = 0;
    const problems = [];

    for (const q of batch) {
      const r = await autoTranslate(q.id, missingLanguages(q));
      translated += r.done.length;
      if (r.failed.length) problems.push(failureNote(r.failed));
      if (r.failed.length && r.done.length === 0) break; // the service is failing — stop instead of retrying everything
    }

    const remaining = (await loadQuestions({})).filter((q) => missingLanguages(q).length > 0).length;
    await audit(req, { action: 'question.translate', category: 'quiz', entity_label: 'Translate all missing', details: { translations_created: translated, remaining } });
    res.json({
      success: problems.length === 0 || translated > 0,
      translated, remaining,
      message: problems.length ? [...new Set(problems)].join(' | ') : null,
    });
  } catch (err) {
    console.error('Translate missing error:', err);
    res.status(500).json({ success: false, message: 'Translation failed' });
  }
});

// ─── POST /api/questions/:id/translate — (re)translate automatically ─────────
router.post('/:id/translate', async (req, res) => {
  try {
    const [existing] = await loadQuestions({ id: req.params.id });
    if (!existing) return res.status(404).json({ success: false, message: 'Question not found' });
    if (!LANGS.includes(existing.language)) {
      return res.status(400).json({ success: false, message: 'Edit this question first and choose the language it is written in.' });
    }
    const wanted = Array.isArray(req.body.languages) && req.body.languages.length
      ? req.body.languages.filter((l) => LANGS.includes(l)) : LANGS;

    const result = await autoTranslate(existing.id, wanted);
    if (result.done.length === 0 && result.failed.length) {
      return res.status(502).json({ success: false, message: `Translation failed. ${failureNote(result.failed)}` });
    }
    const [question] = await loadQuestions({ id: existing.id });
    await audit(req, {
      action: 'question.translate', category: 'quiz', entity_type: 'quiz_question', entity_id: existing.id,
      entity_label: label(question.question_text), details: { languages: result.done, provider: translator.providerInfo().label },
    });
    res.json({
      success: true,
      question: { ...question, missing_translations: missingLanguages(question) },
      translation_warning: result.failed.length ? failureNote(result.failed) : null,
    });
  } catch (err) {
    console.error('Translate error:', err);
    res.status(500).json({ success: false, message: 'Translation failed' });
  }
});

// ─── PUT /api/questions/:id/translations/:lang — edit a translation by hand ──
router.put('/:id/translations/:lang', async (req, res) => {
  try {
    const lang = req.params.lang;
    const [existing] = await loadQuestions({ id: req.params.id });
    if (!existing) return res.status(404).json({ success: false, message: 'Question not found' });
    if (!LANGS.includes(lang) || lang === existing.language) {
      return res.status(400).json({ success: false, message: 'Choose one of the other languages to translate into.' });
    }

    const question_text = String(req.body.question_text || '').trim();
    const explanation   = String(req.body.explanation || '').trim().slice(0, 1000);
    const options       = (Array.isArray(req.body.options) ? req.body.options : []).map((o) => String(o || '').trim());

    if (question_text.length < 5 || question_text.length > 500) return res.status(400).json({ success: false, message: 'The translated question must be 5–500 characters.' });
    if (options.length !== existing.options.length || options.some((o) => !o || o.length > 300)) {
      return res.status(400).json({ success: false, message: `Translate all ${existing.options.length} answer options (300 characters max each).` });
    }
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      return res.status(400).json({ success: false, message: 'Two translated options are identical — each option must be different.' });
    }

    const before = existing.translations?.[lang] || null;
    const translations = { ...(existing.translations || {}), [lang]: { question_text, explanation, options, auto: false, at: new Date().toISOString() } };
    await db('quiz_questions').where({ id: existing.id }).update({ translations: JSON.stringify(translations), updated_at: new Date().toISOString() });

    const [question] = await loadQuestions({ id: existing.id });
    await audit(req, {
      action: 'question.translation_edit', category: 'quiz', entity_type: 'quiz_question', entity_id: existing.id,
      entity_label: label(existing.question_text),
      before: before ? { language: lang, question_text: before.question_text, explanation: before.explanation, options: before.options } : { language: lang },
      after: { language: lang, question_text, explanation, options },
    });
    res.json({ success: true, question: { ...question, missing_translations: missingLanguages(question) } });
  } catch (err) {
    console.error('Save translation error:', err);
    res.status(500).json({ success: false, message: 'Could not save the translation' });
  }
});

// ─── POST /api/questions/:id/toggle — switch on / off ────────────────────────
router.post('/:id/toggle', async (req, res) => {
  try {
    const q = await db('quiz_questions').where({ id: req.params.id }).first();
    if (!q) return res.status(404).json({ success: false, message: 'Question not found' });
    const is_active = !q.is_active;
    await db('quiz_questions').where({ id: q.id }).update({ is_active, updated_at: new Date().toISOString() });
    await audit(req, {
      action: is_active ? 'question.activate' : 'question.deactivate', category: 'quiz',
      entity_type: 'quiz_question', entity_id: q.id, entity_label: label(q.question_text),
    });
    res.json({ success: true, is_active });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not update the question' });
  }
});

// ─── DELETE /api/questions/:id — reason required ─────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 5) {
      return res.status(400).json({ success: false, code: 'REASON_REQUIRED', message: 'A reason (at least 5 characters) is required.' });
    }
    const [existing] = await loadQuestions({ id: req.params.id });
    if (!existing) return res.status(404).json({ success: false, message: 'Question not found' });

    await audit(req, {
      action: 'question.delete', category: 'quiz', entity_type: 'quiz_question', entity_id: existing.id,
      entity_label: label(existing.question_text), reason: reason.slice(0, 1000), before: snapshot(existing),
    });
    await db('quiz_questions').where({ id: existing.id }).delete(); // options cascade
    res.json({ success: true, message: 'Question deleted' });
  } catch (err) {
    console.error('Delete question error:', err);
    res.status(500).json({ success: false, message: 'Could not delete the question' });
  }
});

module.exports = router;
