/**
 * Question translator (English / Français / Kinyarwanda).
 * Uses OpenAI when OPENAI_API_KEY is set; otherwise translateQuestion() throws a
 * clear message so the admin can still translate by hand in the Translations modal.
 */
const LANG_NAMES = { en: "English", fr: "French", rw: "Kinyarwanda" };

let client = null;
function getClient() {
  if (client === null) {
    client = false;
    if (process.env.OPENAI_API_KEY) {
      try {
        const { OpenAI } = require("openai");
        client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      } catch (err) {
        console.error(
          "Translator: could not load openai package:",
          err.message,
        );
      }
    }
  }
  return client;
}

function providerInfo() {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (getClient()) {
    return {
      available: true,
      label: `OpenAI (${model})`,
      note: "Questions are translated automatically. You can review and edit every translation.",
    };
  }
  return {
    available: false,
    label: "Automatic translation is off",
    note: "Type the translations by hand in the question form (Translations section). When an API key is added on the server, the missing ones can be translated with one click.",
  };
}

/**
 * @param {{question_text:string, explanation:string, options:string[]}} source
 * @param {"en"|"fr"|"rw"} from
 * @param {"en"|"fr"|"rw"} to
 * @returns {Promise<{question_text:string, explanation:string, options:string[]}>}
 */
async function translateQuestion(source, from, to) {
  const openai = getClient();
  if (!openai) {
    throw new Error(
      "Automatic translation is not configured (OPENAI_API_KEY is missing).",
    );
  }
  if (!LANG_NAMES[from] || !LANG_NAMES[to])
    throw new Error("Unsupported language.");

  const payload = {
    question_text: source.question_text,
    explanation: source.explanation || "",
    options: source.options,
  };

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `You translate workplace Health, Safety & Environment (HSE) induction quiz questions from ${LANG_NAMES[from]} to ${LANG_NAMES[to]}. ` +
          "Keep the meaning exact, keep safety terms precise, and do not add or remove information. " +
          'Reply with JSON only, in exactly this shape: {"question_text": string, "explanation": string, "options": string[]}. ' +
          "The options array must have the same number of items, in the same order, as the input. Use an empty string for an empty explanation.",
      },
      { role: "user", content: JSON.stringify(payload) },
    ],
  });

  let out;
  try {
    out = JSON.parse(response.choices?.[0]?.message?.content || "{}");
  } catch {
    throw new Error("The translation service returned an unreadable answer.");
  }

  const options = Array.isArray(out.options)
    ? out.options.map((o) => String(o || "").trim())
    : [];
  if (
    !out.question_text ||
    options.length !== source.options.length ||
    options.some((o) => !o)
  ) {
    throw new Error("The translation was incomplete — please try again.");
  }
  return {
    question_text: String(out.question_text).trim().slice(0, 500),
    explanation: String(out.explanation || "")
      .trim()
      .slice(0, 1000),
    options: options.map((o) => o.slice(0, 300)),
  };
}

module.exports = { LANG_NAMES, providerInfo, translateQuestion };
