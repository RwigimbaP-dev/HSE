const { db } = require('../database/schema');

const clamp = (n, lo, hi, dflt) => {
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};

/** Quiz length and pass mark, as set by the admin (defaults: 5 questions, 80 %). */
async function getQuizSettings() {
  const rows = await db('system_config').whereIn('key', ['quiz_question_count', 'quiz_pass_score']);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    question_count: clamp(map.quiz_question_count, 1, 50, 5),
    pass_score:     clamp(map.quiz_pass_score, 1, 100, 80),
  };
}

async function saveSetting(key, value) {
  const exists = await db('system_config').where({ key }).first();
  if (exists) await db('system_config').where({ key }).update({ value: String(value) });
  else        await db('system_config').insert({ key, value: String(value) });
}

const parseJson = (v) => { if (!v) return null; try { return JSON.parse(v); } catch { return null; } };

/**
 * Questions written by the admin, in the visitor's language.
 * A question is written once (in its "source" language) and translated automatically:
 * the visitor gets the translation for their language, or the original text if no translation exists yet.
 * Returns the quiz format used by the visitor quiz: { id, text, options[], correct, explanation },
 * or null when the admin has not added any active question.
 */
async function pickAdminQuestions(language, count) {
  const questions = await db('quiz_questions').where({ is_active: true });
  if (questions.length === 0) return null;

  const options = await db('quiz_options')
    .whereIn('question_id', questions.map((q) => q.id))
    .orderBy('sort_order', 'asc').orderBy('id', 'asc');

  const byQuestion = {};
  for (const o of options) (byQuestion[o.question_id] ||= []).push(o);

  const usable = questions.filter((q) => {
    const opts = byQuestion[q.id] || [];
    return opts.length >= 2 && opts.filter((o) => o.is_correct).length === 1;
  });
  if (usable.length === 0) return null;

  // Random questions each attempt, in a random order
  const picked = [...usable].sort(() => Math.random() - 0.5).slice(0, count);
  return picked.map((q, i) => {
    const opts = byQuestion[q.id];
    let text = q.question_text;
    let optionTexts = opts.map((o) => o.option_text);
    let explanation = q.explanation || '';

    const tr = language !== q.language ? parseJson(q.translations)?.[language] : null;
    if (tr && tr.question_text && Array.isArray(tr.options) && tr.options.length === opts.length && tr.options.every(Boolean)) {
      text = tr.question_text;
      optionTexts = tr.options;
      explanation = tr.explanation || '';
    }

    return {
      id: i + 1,
      text,
      options: optionTexts,
      correct: opts.findIndex((o) => o.is_correct),
      explanation,
      bank_id: q.id,
    };
  });
}

module.exports = { getQuizSettings, saveSetting, pickAdminQuestions };
