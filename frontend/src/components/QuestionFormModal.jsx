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

/**
 * Create / edit a quiz question together with its answer options.
 * Options can be added, edited, removed and one is marked as the correct answer.
 * (Options are rendered from a list, not from an inner component, so inputs keep focus.)
 */
export default function QuestionFormModal({
  open,
  question,
  saving,
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
  const firstRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (question) {
      setLanguage(
        ["en", "fr", "rw"].includes(question.language)
          ? question.language
          : "en",
      );
      setAutoTranslate(true);
      setText(question.question_text || "");
      setExplanation(question.explanation || "");
      setIsActive(question.is_active !== false);
      setOptions(
        question.options.map((o) => newOption(o.option_text, !!o.is_correct)),
      );
    } else {
      setLanguage("en");
      setAutoTranslate(true);
      setText("");
      setExplanation("");
      setIsActive(true);
      setOptions(blankOptions());
    }
    setTimeout(() => firstRef.current?.focus(), 50);
  }, [open, question]);

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
    setError("");
    onSubmit({
      language,
      question_text: text.trim(),
      explanation: explanation.trim(),
      is_active: isActive,
      auto_translate: autoTranslate,
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

          <div className="alert alert-info" style={{ marginTop: 14 }}>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={autoTranslate}
                onChange={(e) => setAutoTranslate(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <strong>🌐 Translate automatically</strong> into the other two
                languages when you save. You write the quiz once; visitors see
                it in the language they chose.
                {question &&
                  " If you change the question or answers, the translations are redone."}
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
