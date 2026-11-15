import { useState, useEffect, useRef } from "react";
import Spinner from "./Spinner";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const LETTERS = ["A", "B", "C", "D", "E", "F"];

const LANGS = [
  ["en", "English"],
  ["fr", "Français"],
  ["rw", "Kinyarwanda"],
];

let counter = 0;
const newOption = (text = "", is_correct = false) => ({
  key: `o${++counter}`,
  text,
  is_correct,
});
const blankOptions = () => [newOption(), newOption(), newOption(), newOption()];
const blankTr = () => ({ text: "", explanation: "", opts: {} });
const blankTrAll = () => ({ en: blankTr(), fr: blankTr(), rw: blankTr() });

/**
 * Create / edit a quiz question together with its answer options.
 * Options can be added, edited, removed and one is marked as the correct answer.
 * (Options are rendered from a list, not from an inner component, so inputs keep focus.)
 */
export default function QuestionFormModal({
  open,
  question,
  saving,
  translator, // { available, label, note } — is automatic translation set up on the server?
  onSubmit,
  onCancel,
}) {
  const [language, setLanguage] = useState("en");
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [text, setText] = useState("");
  const [explanation, setExplanation] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [options, setOptions] = useState(blankOptions());
  const [error, setError] = useState("");
  // Translations typed by hand: tr[lang] = { text, explanation, opts: { [optionKey]: text } }
  const [tr, setTr] = useState(blankTrAll());
  const [trTab, setTrTab] = useState("fr");
  const [trOpen, setTrOpen] = useState(false);
  const firstRef = useRef(null);
  const autoAvailable = !!translator?.available;

  useEffect(() => {
    if (!open) return;
    setError("");
    if (question) {
      const lang = ["en", "fr", "rw"].includes(question.language)
        ? question.language
        : "en";
      const opts = question.options.map((o) =>
        newOption(o.option_text, !!o.is_correct),
      );
      setLanguage(lang);
      setAutoTranslate(autoAvailable);
      setText(question.question_text || "");
      setExplanation(question.explanation || "");
      setIsActive(question.is_active !== false);
      setOptions(opts);

      // show the translations already saved (typed or automatic) so they can be reviewed / edited here
      const t = blankTrAll();
      let hasAny = false;
      for (const [code] of LANGS) {
        const saved = question.translations?.[code];
        if (!saved || code === lang) continue;
        hasAny = true;
        t[code] = {
          text: saved.question_text || "",
          explanation: saved.explanation || "",
          opts: Object.fromEntries(
            opts.map((o, i) => [o.key, saved.options?.[i] || ""]),
          ),
        };
      }
      setTr(t);
      setTrOpen(hasAny || !autoAvailable);
      setTrTab(LANGS.find(([c]) => c !== lang)[0]);
    } else {
      setLanguage("en");
      setAutoTranslate(autoAvailable);
      setText("");
      setExplanation("");
      setIsActive(true);
      setOptions(blankOptions());
      setTr(blankTrAll());
      setTrOpen(!autoAvailable); // no automatic translation yet → show the manual section right away
      setTrTab("fr");
    }
    setTimeout(() => firstRef.current?.focus(), 50);
  }, [open, question, autoAvailable]);

  if (!open) return null;

  const setOpt = (key, patch) =>
    setOptions((prev) =>
      prev.map((o) => (o.key === key ? { ...o, ...patch } : o)),
    );
  const markCorrect = (key) =>
    setOptions((prev) =>
      prev.map((o) => ({ ...o, is_correct: o.key === key })),
    );
  const removeOpt = (key) =>
    setOptions((prev) =>
      prev.length > MIN_OPTIONS ? prev.filter((o) => o.key !== key) : prev,
    );
  const addOpt = () =>
    setOptions((prev) =>
      prev.length < MAX_OPTIONS ? [...prev, newOption()] : prev,
    );

  // ── translations typed by hand ──
  const filledOpts = options.filter((o) => o.text.trim());
  const otherLangs = LANGS.filter(([c]) => c !== language);
  const activeTab = otherLangs.some(([c]) => c === trTab)
    ? trTab
    : otherLangs[0][0];
  const setTrField = (code, patch) =>
    setTr((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
  const setTrOpt = (code, key, value) =>
    setTr((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        opts: { ...prev[code].opts, [key]: value },
      },
    }));
  // "empty" | "partial" | "complete"
  const trStatus = (code) => {
    const t = tr[code];
    const optTexts = filledOpts.map((o) => (t.opts[o.key] || "").trim());
    const any = t.text.trim() || t.explanation.trim() || optTexts.some(Boolean);
    if (!any) return "empty";
    return t.text.trim() && optTexts.every(Boolean) ? "complete" : "partial";
  };

  const submit = (e) => {
    e.preventDefault();
    const filled = options.filter((o) => o.text.trim());
    if (text.trim().length < 5)
      return setError("Write the question (at least 5 characters).");
    if (filled.length < MIN_OPTIONS)
      return setError(`Add at least ${MIN_OPTIONS} answer options.`);
    if (filled.filter((o) => o.is_correct).length !== 1)
      return setError(
        "Select the correct answer (the round button next to it).",
      );
    const lower = filled.map((o) => o.text.trim().toLowerCase());
    if (new Set(lower).size !== lower.length)
      return setError(
        "Two options are identical — each option must be different.",
      );

    // Translations typed by hand: each language is either complete or left empty
    const translations = {};
    for (const [code, name] of otherLangs) {
      const status = trStatus(code);
      if (status === "partial") {
        setTrOpen(true);
        setTrTab(code);
        return setError(
          `${name} translation is incomplete — fill the question and all ${filledOpts.length} answer options, or press "Clear" to leave ${name} empty.`,
        );
      }
      if (status === "complete") {
        translations[code] = {
          question_text: tr[code].text.trim(),
          explanation: tr[code].explanation.trim(),
          options: filledOpts.map((o) => (tr[code].opts[o.key] || "").trim()),
        };
      }
    }

    setError("");
    onSubmit({
      language,
      translations,
      question_text: text.trim(),
      explanation: explanation.trim(),
      is_active: isActive,
      auto_translate: autoTranslate && autoAvailable,
      options: filled.map((o) => ({
        option_text: o.text.trim(),
        is_correct: o.is_correct,
      })),
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel?.();
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "white",
          borderRadius: 14,
          width: "100%",
          maxWidth: 640,
          maxHeight: "92vh",
          overflow: "auto",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            background: "var(--primary, #1a365d)",
            color: "white",
            fontWeight: 700,
          }}
        >
          {question ? "✏️ Edit question" : "➕ Add question"}
        </div>

        <div style={{ padding: 20 }}>
          <div className="form-group">
            <label className="form-label">
              Question <span className="required-mark">*</span>
            </label>
            <textarea
              ref={firstRef}
              rows={2}
              className="form-input"
              maxLength={500}
              style={{
                width: "100%",
                resize: "vertical",
                fontFamily: "inherit",
              }}
              placeholder="e.g. What must you do when the fire alarm sounds?"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Answer options <span className="required-mark">*</span>
              <span
                style={{
                  fontWeight: 400,
                  color: "var(--gray-400)",
                  marginLeft: 8,
                  fontSize: "0.75rem",
                }}
              >
                tap the round button to mark the correct answer
              </span>
            </label>

            {options.map((o, i) => (
              <div
                key={o.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  type="radio"
                  name="correct-option"
                  checked={o.is_correct}
                  onChange={() => markCorrect(o.key)}
                  title="Correct answer"
                  style={{
                    width: 20,
                    height: 20,
                    accentColor: "var(--success, #276749)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    width: 20,
                    fontWeight: 700,
                    color: "var(--gray-500)",
                    flexShrink: 0,
                  }}
                >
                  {LETTERS[i]}
                </span>
                <input
                  className="form-input"
                  style={{
                    flex: 1,
                    ...(o.is_correct
                      ? {
                          borderColor: "var(--success, #276749)",
                          background: "var(--success-bg, #f0fff4)",
                        }
                      : {}),
                  }}
                  maxLength={300}
                  placeholder={`Option ${LETTERS[i]}`}
                  autoComplete="off"
                  value={o.text}
                  onChange={(e) => setOpt(o.key, { text: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  title="Remove option"
                  disabled={options.length <= MIN_OPTIONS}
                  onClick={() => removeOpt(o.key)}
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={addOpt}
              disabled={options.length >= MAX_OPTIONS}
            >
              ➕ Add option{" "}
              {options.length >= MAX_OPTIONS ? `(max ${MAX_OPTIONS})` : ""}
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">
              Explanation{" "}
              <span
                style={{
                  fontWeight: 400,
                  color: "var(--gray-400)",
                  fontSize: "0.75rem",
                }}
              >
                (optional — shown after the visitor answers)
              </span>
            </label>
            <textarea
              rows={2}
              className="form-input"
              maxLength={1000}
              style={{
                width: "100%",
                resize: "vertical",
                fontFamily: "inherit",
              }}
              placeholder="Why is this the right answer?"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">This question is written in</label>
              <select
                className="form-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.9rem",
                paddingBottom: 8,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              Active (can appear in the quiz)
            </label>
          </div>

          {/* ── Translations: type them by hand (works without any API key) ── */}
          <div
            style={{
              marginTop: 14,
              border: "1px solid var(--gray-200, #e2e8f0)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setTrOpen((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "10px 14px",
                background: "var(--gray-50, #f7fafc)",
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "0.9rem",
                textAlign: "left",
              }}
            >
              <span>
                🌐 Translations{" "}
                <span style={{ fontWeight: 400, color: "var(--gray-500)" }}>
                  (optional — type them yourself)
                </span>
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {otherLangs.map(([code, name]) => {
                  const st = trStatus(code);
                  return (
                    <span
                      key={code}
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background:
                          st === "complete"
                            ? "#c6f6d5"
                            : st === "partial"
                              ? "#fefcbf"
                              : "#edf2f7",
                        color:
                          st === "complete"
                            ? "#276749"
                            : st === "partial"
                              ? "#975a16"
                              : "#718096",
                      }}
                    >
                      {code.toUpperCase()}{" "}
                      {st === "complete" ? "✓" : st === "partial" ? "…" : "–"}
                    </span>
                  );
                })}
                <span>{trOpen ? "▲" : "▼"}</span>
              </span>
            </button>

            {trOpen && (
              <div style={{ padding: 14 }}>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--gray-500)",
                    marginBottom: 10,
                  }}
                >
                  The quiz above is the original. Type its translation into each
                  language below, or leave a language empty to translate it
                  later. The correct answer is the same in every language.
                </div>

                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {otherLangs.map(([code, name]) => (
                    <button
                      key={code}
                      type="button"
                      className={`btn btn-sm ${activeTab === code ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setTrTab(code)}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                {(() => {
                  const code = activeTab;
                  const name = LANGS.find(([c]) => c === code)[1];
                  const t = tr[code];
                  return (
                    <div key={code}>
                      <div className="form-group">
                        <label className="form-label">Question in {name}</label>
                        <textarea
                          rows={2}
                          className="form-input"
                          maxLength={500}
                          style={{
                            width: "100%",
                            resize: "vertical",
                            fontFamily: "inherit",
                          }}
                          placeholder={text.trim() || "Translated question"}
                          value={t.text}
                          onChange={(e) =>
                            setTrField(code, { text: e.target.value })
                          }
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">
                          Answer options in {name}
                        </label>
                        {filledOpts.length === 0 && (
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--gray-500)",
                            }}
                          >
                            Write the answer options in the original language
                            first.
                          </div>
                        )}
                        {filledOpts.map((o, i) => (
                          <div
                            key={o.key}
                            style={{ marginBottom: 8 }}
                            title={o.text}
                          >
                            <div
                              style={{
                                fontSize: "0.72rem",
                                color: "var(--gray-500)",
                                marginBottom: 2,
                                display: "flex",
                                gap: 6,
                              }}
                            >
                              <strong>{LETTERS[i]}</strong>
                              <span
                                style={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {o.text}
                              </span>
                              {o.is_correct && (
                                <span style={{ color: "#276749" }}>
                                  ✔ correct
                                </span>
                              )}
                            </div>
                            <input
                              className="form-input"
                              style={{
                                width: "100%",
                                ...(o.is_correct
                                  ? {
                                      borderColor: "var(--success, #276749)",
                                      background: "var(--success-bg, #f0fff4)",
                                    }
                                  : {}),
                              }}
                              maxLength={300}
                              autoComplete="off"
                              placeholder={`Option ${LETTERS[i]} in ${name}`}
                              value={t.opts[o.key] || ""}
                              onChange={(e) =>
                                setTrOpt(code, o.key, e.target.value)
                              }
                            />
                          </div>
                        ))}
                      </div>

                      <div className="form-group">
                        <label className="form-label">
                          Explanation in {name}{" "}
                          <span
                            style={{
                              fontWeight: 400,
                              color: "var(--gray-400)",
                              fontSize: "0.75rem",
                            }}
                          >
                            (optional)
                          </span>
                        </label>
                        <textarea
                          rows={2}
                          className="form-input"
                          maxLength={1000}
                          style={{
                            width: "100%",
                            resize: "vertical",
                            fontFamily: "inherit",
                          }}
                          value={t.explanation}
                          onChange={(e) =>
                            setTrField(code, { explanation: e.target.value })
                          }
                        />
                      </div>

                      {trStatus(code) !== "empty" && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            setTr((prev) => ({ ...prev, [code]: blankTr() }))
                          }
                        >
                          Clear {name}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* ── Automatic translation (needs an API key on the server) ── */}
          <div
            className={`alert ${autoAvailable ? "alert-info" : "alert-warning"}`}
            style={{ marginTop: 14 }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                cursor: autoAvailable ? "pointer" : "default",
                opacity: autoAvailable ? 1 : 0.85,
              }}
            >
              <input
                type="checkbox"
                checked={autoTranslate && autoAvailable}
                disabled={!autoAvailable}
                onChange={(e) => setAutoTranslate(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <strong>🌐 Translate automatically</strong>{" "}
                {autoAvailable ? (
                  <>
                    any language you left empty above, when you save.
                    Translations you typed yourself are never overwritten.
                  </>
                ) : (
                  <>
                    — not set up yet. Type the translations above now; once an
                    API key is added on the server you can translate the rest
                    with one click ("Translate all missing") — nothing typed is
                    lost.
                  </>
                )}
              </span>
            </label>
          </div>

          {error && (
            <div className="alert alert-danger" style={{ marginTop: 14 }}>
              ⚠ {error}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              marginTop: 18,
            }}
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={saving}
            >
              {saving ? <Spinner size="sm" /> : null}{" "}
              {question ? "Save changes" : "Add question"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
