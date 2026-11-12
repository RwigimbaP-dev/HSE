/**
 * Automatic translation of quiz questions between English, French and Kinyarwanda.
 *
 * Pick the service with environment variables (checked in this order):
 *   1. GOOGLE_TRANSLATE_API_KEY  → Google Cloud Translation  (best for Kinyarwanda, 500k chars/month free)
 *   2. OPENAI_API_KEY            → OpenAI                     (good, uses the key you already may have)
 *   3. nothing                   → MyMemory                   (free, no key, limited per day, lower quality)
 * Force one with TRANSLATION_PROVIDER=google | openai | mymemory.
 *
 * No extra npm packages — plain fetch.
 */
const LANG_NAMES = { en: 'English', fr: 'French', rw: 'Kinyarwanda' };
const LANGS = Object.keys(LANG_NAMES);

function chooseProvider() {
  const forced = (process.env.TRANSLATION_PROVIDER || '').toLowerCase();
  if (forced === 'google'   && process.env.GOOGLE_TRANSLATE_API_KEY) return 'google';
  if (forced === 'openai'   && process.env.OPENAI_API_KEY)           return 'openai';
  if (forced === 'mymemory') return 'mymemory';
  if (process.env.GOOGLE_TRANSLATE_API_KEY) return 'google';
  if (process.env.OPENAI_API_KEY)           return 'openai';
  return 'mymemory';
}

function providerInfo() {
  const provider = chooseProvider();
  const info = {
    google:   { label: 'Google Translate',  note: 'Best quality for Kinyarwanda.' },
    openai:   { label: 'OpenAI',            note: 'Good quality. Review Kinyarwanda wording.' },
    mymemory: { label: 'MyMemory (free)',   note: 'Free with a small daily limit and lower quality. For better Kinyarwanda add GOOGLE_TRANSLATE_API_KEY (or OPENAI_API_KEY) on Render.' },
  }[provider];
  return { provider, ...info };
}

const decodeEntities = (s) => String(s)
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// ─── Providers: each takes an array of non-empty strings, returns the translated array ──
async function viaGoogle(list, from, to) {
  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(process.env.GOOGLE_TRANSLATE_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: list, source: from, target: to, format: 'text' }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Google Translate error (HTTP ${res.status})`);
  const out = (data?.data?.translations || []).map((t) => decodeEntities(t.translatedText));
  if (out.length !== list.length) throw new Error('Google Translate returned an unexpected result');
  return out;
}

async function viaOpenAI(list, from, to) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            `You translate workplace health-and-safety (HSE) quiz text from ${LANG_NAMES[from]} to ${LANG_NAMES[to]}. ` +
            'Keep the meaning exact. Keep numbers, units, names and abbreviations (PPE, PASS...). ' +
            'Do not add, remove or explain anything. Different answer options must stay different. ' +
            `The user sends a JSON array of ${list.length} strings. Reply ONLY with JSON: {"translations": [...]} ` +
            `containing exactly ${list.length} translated strings in the same order.`,
        },
        { role: 'user', content: JSON.stringify(list) },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI error (HTTP ${res.status})`);
  let out;
  try { out = JSON.parse(data.choices[0].message.content).translations; } catch { out = null; }
  if (!Array.isArray(out) || out.length !== list.length || out.some((x) => typeof x !== 'string')) {
    throw new Error('OpenAI returned an unexpected result');
  }
  return out;
}

async function viaMyMemory(list, from, to) {
  const out = [];
  for (const text of list) {
    const params = new URLSearchParams({ q: text.slice(0, 480), langpair: `${from}|${to}` });
    if (process.env.MYMEMORY_EMAIL) params.set('de', process.env.MYMEMORY_EMAIL); // raises the free daily limit
    const res = await fetch(`https://api.mymemory.translated.net/get?${params}`, { signal: AbortSignal.timeout(20000) });
    const data = await res.json().catch(() => ({}));
    const translated = data?.responseData?.translatedText;
    if (!res.ok || !translated || String(data.responseStatus) !== '200' || /MYMEMORY WARNING/i.test(translated)) {
      throw new Error(/MYMEMORY WARNING|429/i.test(`${translated} ${data.responseStatus}`)
        ? 'The free translation limit for today is used up. Try again tomorrow or set GOOGLE_TRANSLATE_API_KEY.'
        : `MyMemory could not translate (${data?.responseDetails || `HTTP ${res.status}`})`);
    }
    out.push(decodeEntities(translated));
  }
  return out;
}

const PROVIDERS = { google: viaGoogle, openai: viaOpenAI, mymemory: viaMyMemory };

/** Translate many strings; empty strings stay empty. Returns an array of the same length. */
async function translateStrings(strings, from, to) {
  if (!LANGS.includes(from) || !LANGS.includes(to)) throw new Error('Unsupported language');
  if (from === to) return [...strings];

  const idx = [];
  const list = [];
  strings.forEach((s, i) => { if (String(s || '').trim()) { idx.push(i); list.push(String(s).trim()); } });
  const result = strings.map(() => '');
  if (list.length === 0) return result;

  const translated = await PROVIDERS[chooseProvider()](list, from, to);
  idx.forEach((original, k) => { result[original] = translated[k].trim(); });
  return result;
}

/**
 * Translate a whole question { question_text, explanation, options: [string] }.
 * The options come back in the same order, so index 0 is still the same answer.
 */
async function translateQuestion(q, from, to) {
  const strings = [q.question_text, q.explanation || '', ...q.options];
  const out = await translateStrings(strings, from, to);
  const options = out.slice(2);
  if (!out[0] || options.some((o) => !o)) throw new Error('Translation came back incomplete');
  return { question_text: out[0], explanation: out[1] || '', options };
}

module.exports = { LANGS, LANG_NAMES, providerInfo, translateStrings, translateQuestion };
