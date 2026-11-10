import { useState, useEffect, useRef, useCallback } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { inductionAPI } from "../../api";
import Spinner from "../../components/Spinner";
import ReasonModal from "../../components/ReasonModal";
import toast from "react-hot-toast";

const TYPE_ICONS = { video_url: "🎬", video_upload: "📹", pdf: "📄" };
const TYPE_LABELS = {
  video_url: "Video URL",
  video_upload: "Uploaded Video",
  pdf: "PDF Document",
};
const LANG_FLAGS = {
  en: "🇬🇧 English",
  fr: "🇫🇷 Français",
  rw: "🇷🇼 Kinyarwanda",
  all: "🌐 All Languages",
};
const LANG_OPTIONS = [
  { value: "en", label: "🇬🇧 English" },
  { value: "fr", label: "🇫🇷 Français" },
  { value: "rw", label: "🇷🇼 Kinyarwanda" },
];

// ─── Quiz Manager Modal ───────────────────────────────────────────────────────
// Handles the full lifecycle: Generate → Edit → Save → Approve per content item
function QuizManagerModal({ item, onClose, onApproved }) {
  const [language, setLanguage] = useState("en");
  const [step, setStep] = useState("idle"); // idle | generating | review | saving | done
  const [questions, setQuestions] = useState([]); // editable question list
  const [savedQuiz, setSavedQuiz] = useState(null); // existing approved quiz
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [approving, setApproving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Load any existing saved quiz for this item
  const loadSaved = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const res = await inductionAPI.getQuiz(item.id, language);
      setSavedQuiz(res.data.quiz);
    } catch {
      setSavedQuiz(null);
    } finally {
      setLoadingSaved(false);
    }
  }, [item.id, language]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  // ── Generate new questions ─────────────────────────────────────────────────
  const handleGenerate = async () => {
    setStep("generating");
    try {
      const res = await inductionAPI.generateQuiz(item.id, language, 5);
      const qs = res.data.questions.map((q, i) => ({ ...q, id: i + 1 }));
      setQuestions(qs);
      setStep("review");
      toast.success(`Generated ${qs.length} questions from "${item.title}"`);
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          "Generation failed. Add key points or description to the content.",
      );
      setStep("idle");
    }
  };

  // ── Edit a question field inline ───────────────────────────────────────────
  const updateQuestion = (qIdx, field, value) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, [field]: value } : q)),
    );
  };

  const updateOption = (qIdx, optIdx, value) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx
          ? {
              ...q,
              options: q.options.map((o, j) => (j === optIdx ? value : o)),
            }
          : q,
      ),
    );
  };

  const setCorrect = (qIdx, optIdx) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, correct: optIdx } : q)),
    );
  };

  const removeQuestion = (qIdx) => {
    setQuestions((prev) =>
      prev.filter((_, i) => i !== qIdx).map((q, i) => ({ ...q, id: i + 1 })),
    );
  };

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        text: "",
        options: ["", "", "", ""],
        correct: 0,
        explanation: "",
      },
    ]);
  };

  // ── Save (draft) ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    // Validate
    const invalid = questions.findIndex(
      (q) => !q.text.trim() || q.options.some((o) => !o.trim()),
    );
    if (invalid !== -1) {
      toast.error(
        `Question ${invalid + 1}: fill in the question text and all 4 options.`,
      );
      return;
    }
    setStep("saving");
    try {
      await inductionAPI.saveQuiz(item.id, language, questions);
      await loadSaved();
      setStep("review");
      toast.success(
        "Questions saved! Review then click Approve to activate for visitors.",
      );
    } catch (err) {
      toast.error(err.response?.data?.message || "Save failed");
      setStep("review");
    }
  };

  // ── Approve ────────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await inductionAPI.approveQuiz(item.id, language);
      await loadSaved();
      setStep("idle");
      setQuestions([]);
      toast.success(res.data.message);
      onApproved?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  // ── Delete saved quiz ──────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      await inductionAPI.deleteQuiz(item.id, language);
      setSavedQuiz(null);
      setDeleteConfirm(false);
      setStep("idle");
      setQuestions([]);
      toast.success(
        "Quiz removed. Visitors will now receive the default question pool.",
      );
      onApproved?.();
    } catch {
      toast.error("Delete failed");
    }
  };

  const showEditor = step === "review" && questions.length > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 16,
          width: "100%",
          maxWidth: 720,
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 25px 60px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--gray-100)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: "white",
            zIndex: 10,
          }}
        >
          <div>
            <h3
              style={{
                fontSize: "1.1rem",
                color: "var(--gray-800)",
                marginBottom: 2,
              }}
            >
              🧠 Quiz Generator
            </h3>
            <p style={{ fontSize: "0.8rem", color: "var(--gray-500)" }}>
              {item.title}
            </p>
          </div>
          <button className="btn-icon" onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Language selector */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
              background: "var(--gray-50)",
              borderRadius: 10,
              padding: "12px 16px",
            }}
          >
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "var(--gray-600)",
                whiteSpace: "nowrap",
              }}
            >
              Quiz Language:
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {LANG_OPTIONS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => {
                    setLanguage(l.value);
                    setStep("idle");
                    setQuestions([]);
                  }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 20,
                    border: "1.5px solid",
                    borderColor:
                      language === l.value
                        ? "var(--primary)"
                        : "var(--gray-200)",
                    background:
                      language === l.value ? "var(--primary)" : "white",
                    color: language === l.value ? "white" : "var(--gray-600)",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Current approved quiz status ── */}
          {loadingSaved ? (
            <div className="flex-center" style={{ padding: "24px 0", gap: 8 }}>
              <Spinner size="sm" />
              <span style={{ color: "var(--gray-400)", fontSize: "0.875rem" }}>
                Loading saved quiz…
              </span>
            </div>
          ) : savedQuiz ? (
            <div
              style={{
                background: savedQuiz.is_approved ? "#f0fff4" : "#fffbeb",
                border: `1px solid ${savedQuiz.is_approved ? "#9ae6b4" : "#fbd38d"}`,
                borderRadius: 10,
                padding: "14px 18px",
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div>
                <p
                  style={{
                    fontWeight: 700,
                    color: savedQuiz.is_approved
                      ? "var(--success)"
                      : "var(--warning)",
                    fontSize: "0.9rem",
                  }}
                >
                  {savedQuiz.is_approved
                    ? "✅ Approved & Active"
                    : "📝 Saved (Not Yet Approved)"}
                </p>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--gray-500)",
                    marginTop: 2,
                  }}
                >
                  {savedQuiz.question_count} questions saved
                  {savedQuiz.is_approved && savedQuiz.approved_at
                    ? ` · Approved ${new Date(savedQuiz.approved_at).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {!savedQuiz.is_approved && (
                  <button
                    className="btn btn-success btn-sm"
                    onClick={handleApprove}
                    disabled={approving}
                  >
                    {approving ? <Spinner size="sm" /> : "✅"} Approve for
                    Visitors
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--danger)" }}
                  onClick={() => setDeleteConfirm(true)}
                >
                  🗑 Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="alert alert-info" style={{ marginBottom: 20 }}>
              ℹ️ No quiz generated yet for this language. Click{" "}
              <strong>Generate Questions</strong> below.
            </div>
          )}

          {/* Delete confirm */}
          {deleteConfirm && (
            <div
              style={{
                background: "var(--danger-bg)",
                border: "1px solid #feb2b2",
                borderRadius: 10,
                padding: "14px 18px",
                marginBottom: 20,
              }}
            >
              <p
                style={{
                  fontWeight: 600,
                  color: "var(--danger)",
                  marginBottom: 10,
                }}
              >
                Remove this quiz? Visitors will revert to the default question
                pool.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn btn-accent btn-sm"
                  onClick={handleDelete}
                >
                  Yes, Remove
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDeleteConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Generate button ── */}
          {step === "idle" && (
            <div>
              <button
                className="btn btn-primary btn-lg btn-full"
                onClick={handleGenerate}
              >
                🤖 Generate Quiz Questions from This Content
              </button>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--gray-400)",
                  textAlign: "center",
                  marginTop: 8,
                }}
              >
                The system reads the content title, description, key points, and
                PDF text to create relevant questions.
              </p>
            </div>
          )}

          {/* ── Generating spinner ── */}
          {step === "generating" && (
            <div
              className="flex-center"
              style={{ padding: "48px 0", flexDirection: "column", gap: 12 }}
            >
              <Spinner size="lg" />
              <p style={{ color: "var(--gray-500)", fontWeight: 600 }}>
                Generating questions…
              </p>
              <p style={{ color: "var(--gray-400)", fontSize: "0.8rem" }}>
                Reading induction content and creating quiz questions
              </p>
            </div>
          )}

          {/* ── Question editor ── */}
          {showEditor && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <h4 style={{ color: "var(--gray-700)", fontSize: "1rem" }}>
                  📝 Review &amp; Edit Questions ({questions.length})
                </h4>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleGenerate}
                >
                  🔄 Regenerate
                </button>
              </div>

              <div
                className="alert alert-warning"
                style={{ marginBottom: 16, fontSize: "0.85rem" }}
              >
                ✏️ Edit any question or option. Click the circle to mark the
                correct answer. Save and then Approve to activate.
              </div>

              {questions.map((q, qIdx) => (
                <div
                  key={q.id}
                  style={{
                    background: "var(--gray-50)",
                    border: "1.5px solid var(--gray-200)",
                    borderRadius: 12,
                    padding: 18,
                    marginBottom: 14,
                  }}
                >
                  {/* Question header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "var(--primary)",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {q.id}
                    </span>
                    <input
                      value={q.text}
                      onChange={(e) =>
                        updateQuestion(qIdx, "text", e.target.value)
                      }
                      className="form-input"
                      style={{ flex: 1, fontWeight: 600, fontSize: "0.9rem" }}
                      placeholder="Question text…"
                    />
                    <button
                      onClick={() => removeQuestion(qIdx)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--gray-400)",
                        fontSize: "1.1rem",
                        padding: 4,
                      }}
                      title="Remove question"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Options */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      marginLeft: 38,
                    }}
                  >
                    {q.options.map((opt, optIdx) => (
                      <div
                        key={optIdx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {/* Correct answer radio */}
                        <button
                          type="button"
                          onClick={() => setCorrect(qIdx, optIdx)}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            border: "2px solid",
                            borderColor:
                              q.correct === optIdx
                                ? "var(--success)"
                                : "var(--gray-300)",
                            background:
                              q.correct === optIdx ? "var(--success)" : "white",
                            cursor: "pointer",
                            flexShrink: 0,
                            padding: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          title={`Mark as correct answer`}
                        >
                          {q.correct === optIdx && (
                            <span
                              style={{
                                color: "white",
                                fontSize: 12,
                                lineHeight: 1,
                              }}
                            >
                              ✓
                            </span>
                          )}
                        </button>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "var(--gray-400)",
                            width: 16,
                          }}
                        >
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <input
                          value={opt}
                          onChange={(e) =>
                            updateOption(qIdx, optIdx, e.target.value)
                          }
                          className="form-input"
                          style={{
                            flex: 1,
                            fontSize: "0.875rem",
                            padding: "7px 12px",
                            borderColor:
                              q.correct === optIdx
                                ? "var(--success)"
                                : undefined,
                            background:
                              q.correct === optIdx
                                ? "var(--success-bg)"
                                : "white",
                          }}
                          placeholder={`Option ${String.fromCharCode(65 + optIdx)}…`}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Explanation */}
                  <div style={{ marginLeft: 38, marginTop: 10 }}>
                    <input
                      value={q.explanation || ""}
                      onChange={(e) =>
                        updateQuestion(qIdx, "explanation", e.target.value)
                      }
                      className="form-input"
                      style={{
                        fontSize: "0.8rem",
                        fontStyle: "italic",
                        color: "var(--gray-500)",
                      }}
                      placeholder="Explanation (optional — shown to visitor after answering)…"
                    />
                  </div>
                </div>
              ))}

              {/* Add question */}
              <button
                className="btn btn-ghost btn-full"
                style={{ marginBottom: 16, borderStyle: "dashed" }}
                onClick={addQuestion}
              >
                + Add Question
              </button>

              {/* Save + Approve buttons */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn btn-outline btn-full"
                  onClick={handleSave}
                  disabled={step === "saving"}
                >
                  {step === "saving" ? <Spinner size="sm" /> : "💾"} Save
                  Questions
                </button>
                <button
                  className="btn btn-success btn-full"
                  onClick={async () => {
                    await handleSave();
                    if (step !== "saving") await handleApprove();
                  }}
                  disabled={step === "saving" || approving}
                >
                  {approving ? <Spinner size="sm" /> : "✅"} Save &amp; Approve
                </button>
              </div>
            </div>
          )}

          {/* ── If we have a saved quiz but no editor open, show load-to-edit button ── */}
          {step === "idle" && savedQuiz && (
            <button
              className="btn btn-ghost btn-full"
              style={{ marginTop: 12 }}
              onClick={async () => {
                const qs =
                  typeof savedQuiz.questions === "string"
                    ? JSON.parse(savedQuiz.questions)
                    : savedQuiz.questions;
                setQuestions(qs);
                setStep("review");
              }}
            >
              ✏️ Edit Saved Questions
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main InductionManagerPage ────────────────────────────────────────────────
export default function InductionManagerPage() {
  const { t } = useLanguage();
  const [content, setContent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState("url");
  const [editItem, setEditItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [minPercent, setMinPercent] = useState("80");
  const [savingPercent, setSavingPercent] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const fileInputRef = useRef(null);
  const directFileInputRef = useRef(null);

  // Quiz manager state
  const [quizItem, setQuizItem] = useState(null); // content item whose quiz we're editing

  const [form, setForm] = useState({
    title: "",
    description: "",
    url: "",
    language: "all",
    sort_order: "0",
    duration_seconds: "",
    key_points: "",
  });
  const [file, setFile] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await inductionAPI.getAll();
      setContent(res.data.content);
    } catch {
      toast.error("Failed to load induction content");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    inductionAPI
      .getSettings()
      .then((r) => setMinPercent(String(r.data.min_watch_percent ?? 80)))
      .catch(() => {});
  }, []);

  const savePercent = async () => {
    const n = parseInt(minPercent, 10);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("Enter a number between 0 and 100");
      return;
    }
    setSavingPercent(true);
    try {
      await inductionAPI.updateSettings(n);
      toast.success(`Visitors must now view ${n}% of the content`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not save");
    } finally {
      setSavingPercent(false);
    }
  };

  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      url: "",
      language: "all",
      sort_order: "0",
      duration_seconds: "",
      key_points: "",
    });
    setFile(null);
    setEditItem(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (directFileInputRef.current) directFileInputRef.current.value = "";
  };

  const openAdd = (mode) => {
    resetForm();
    setFormMode(mode);
    setShowForm(true);
  };

  const handleDirectFileSelect = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    resetForm();
    setFile(selected);
    const nameWithoutExt = selected.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_]/g, " ");
    setForm((p) => ({ ...p, title: nameWithoutExt }));
    setFormMode("upload");
    setShowForm(true);
    e.target.value = "";
  };

  const openEdit = (item) => {
    setForm({
      title: item.title,
      description: item.description || "",
      url: item.url || "",
      language: item.language,
      sort_order: String(item.sort_order),
      duration_seconds: item.duration_seconds
        ? String(item.duration_seconds)
        : "",
      key_points: item.key_points || "",
    });
    setFormMode(
      item.type === "pdf" || item.type === "video_upload" ? "upload" : "url",
    );
    setEditItem(item);
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (formMode === "url" && !form.url.trim()) {
      toast.error("Video URL is required");
      return;
    }
    if (formMode === "upload" && !editItem && !file) {
      toast.error("Please select a file");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        language: form.language,
        sort_order: form.sort_order,
        key_points: form.key_points || null,
      };
      if (editItem) {
        await inductionAPI.update(editItem.id, {
          ...payload,
          url: form.url,
          duration_seconds: form.duration_seconds || null,
        });
        toast.success("Content updated");
      } else if (formMode === "url") {
        await inductionAPI.addUrl({
          ...payload,
          url: form.url,
          duration_seconds: form.duration_seconds || null,
        });
        toast.success("Video URL added");
      } else {
        const fd = new FormData();
        fd.append("file", file);
        Object.entries(payload).forEach(
          ([k, v]) => v != null && fd.append(k, v),
        );
        const res = await inductionAPI.upload(fd);
        toast.success("File uploaded successfully");
        if (res.data.contentExtracted)
          toast.success("📄 PDF text extracted for quiz generation", {
            duration: 5000,
          });
      }
      setShowForm(false);
      resetForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item) => {
    try {
      await inductionAPI.update(item.id, { is_active: !item.is_active });
      toast.success(item.is_active ? "Deactivated" : "Activated");
      load();
    } catch {
      toast.error("Update failed");
    }
  };

  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleDelete = (item) => setDeleteTarget(item);

  const confirmDelete = async (reason) => {
    const item = deleteTarget;
    setDeleting(item.id);
    try {
      await inductionAPI.delete(item.id, reason);
      toast.success("Deleted");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <ReasonModal
        open={!!deleteTarget}
        danger
        title="Delete induction content"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.title}"? Its file and quiz questions are removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        loading={deleting !== null}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.25rem", color: "var(--gray-800)" }}>
            🎓 Induction Content Manager
          </h2>
          <p
            style={{
              color: "var(--gray-500)",
              fontSize: "0.875rem",
              marginTop: 2,
            }}
          >
            Upload content, generate a quiz from it, then approve it for
            visitors
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            ref={directFileInputRef}
            type="file"
            accept=".pdf,video/*"
            style={{ display: "none" }}
            onChange={handleDirectFileSelect}
          />
          <button
            className="btn btn-outline btn-sm"
            onClick={() => directFileInputRef.current?.click()}
          >
            📁 Upload PDF / Video
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => openAdd("url")}
          >
            🎬 Add Video URL
          </button>
        </div>
      </div>

      {/* How it works banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 100%)",
          border: "1px solid #bee3f8",
          borderRadius: 12,
          padding: "14px 18px",
          marginBottom: 20,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {[
          { n: "1", icon: "📁", text: "Upload a video or PDF" },
          { n: "2", icon: "✏️", text: "Add Key Safety Points" },
          { n: "3", icon: "🤖", text: "Click 🧠 to generate quiz" },
          { n: "4", icon: "✅", text: "Review, edit, then Approve" },
          { n: "5", icon: "👥", text: "Visitors get those questions" },
        ].map((step) => (
          <div
            key={step.n}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "var(--primary)",
                color: "white",
                fontSize: "0.7rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {step.n}
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--gray-600)" }}>
              {step.icon} {step.text}
            </span>
            {step.n !== "5" && (
              <span style={{ color: "var(--gray-300)", fontSize: "0.75rem" }}>
                →
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Minimum % of content a visitor must view */}
      <div
        className="card"
        style={{
          padding: "14px 18px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: "0.9rem",
              color: "var(--gray-800)",
            }}
          >
            ⚙️ Required viewing before the quiz
          </div>
          <div
            style={{
              fontSize: "0.8rem",
              color: "var(--gray-500)",
              marginTop: 2,
            }}
          >
            % of the induction items a visitor must view to unlock the quiz. Use
            0 to let visitors continue without viewing everything.
          </div>
        </div>
        <input
          type="number"
          min="0"
          max="100"
          value={minPercent}
          onChange={(e) => setMinPercent(e.target.value)}
          className="form-input"
          style={{ width: 90 }}
        />
        <span style={{ fontWeight: 700 }}>%</span>
        <button
          className="btn btn-primary btn-sm"
          onClick={savePercent}
          disabled={savingPercent}
        >
          {savingPercent ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Content list */}
      <div className="card">
        {loading ? (
          <div
            className="flex-center"
            style={{ padding: "48px 0", flexDirection: "column", gap: 12 }}
          >
            <Spinner size="lg" />
            <p style={{ color: "var(--gray-400)" }}>Loading content...</p>
          </div>
        ) : content.length === 0 ? (
          <div
            className="flex-center"
            style={{ padding: "64px 0", flexDirection: "column", gap: 12 }}
          >
            <span style={{ fontSize: "3rem" }}>📭</span>
            <p style={{ color: "var(--gray-500)" }}>
              No induction content yet. Upload a PDF or add a video URL to get
              started.
            </p>
          </div>
        ) : (
          <div>
            {content.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  padding: "18px 24px",
                  borderBottom: "1px solid var(--gray-100)",
                  opacity: item.is_active ? 1 : 0.55,
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 10,
                    background: item.type === "pdf" ? "#fff5f5" : "#f0f7ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.5rem",
                    flexShrink: 0,
                  }}
                >
                  {TYPE_ICONS[item.type] || "📄"}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: "0.95rem",
                        color: "var(--gray-800)",
                      }}
                    >
                      {item.title}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        background: "var(--gray-100)",
                        color: "var(--gray-600)",
                        padding: "2px 8px",
                        borderRadius: 20,
                        fontWeight: 600,
                      }}
                    >
                      {TYPE_LABELS[item.type]}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        background: "#e0f2fe",
                        color: "#0369a1",
                        padding: "2px 8px",
                        borderRadius: 20,
                        fontWeight: 600,
                      }}
                    >
                      {LANG_FLAGS[item.language] || item.language}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        background: item.is_active ? "#dcfce7" : "#f1f5f9",
                        color: item.is_active
                          ? "var(--success)"
                          : "var(--gray-500)",
                        padding: "2px 8px",
                        borderRadius: 20,
                        fontWeight: 700,
                      }}
                    >
                      {item.is_active ? "● Active" : "○ Inactive"}
                    </span>
                    {item.has_key_points && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          background: "#fef9c3",
                          color: "#92400e",
                          padding: "2px 8px",
                          borderRadius: 20,
                          fontWeight: 600,
                        }}
                      >
                        ✏️ Key Points
                      </span>
                    )}
                    {item.has_content_text && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          background: "#ede9fe",
                          color: "#6d28d9",
                          padding: "2px 8px",
                          borderRadius: 20,
                          fontWeight: 600,
                        }}
                      >
                        📄 Text Extracted
                      </span>
                    )}
                  </div>

                  {item.description && (
                    <p
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--gray-500)",
                        marginTop: 4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 500,
                      }}
                    >
                      {item.description}
                    </p>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      marginTop: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: "0.75rem", color: "var(--primary)" }}
                      >
                        🔗{" "}
                        {item.url.length > 50
                          ? item.url.slice(0, 50) + "…"
                          : item.url}
                      </a>
                    )}
                    {item.file_name && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--gray-500)",
                        }}
                      >
                        📎 {item.file_name}{" "}
                        {item.file_size
                          ? `(${formatSize(item.file_size)})`
                          : ""}
                      </span>
                    )}
                    {item.file_missing && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "var(--danger)",
                        }}
                      >
                        ⚠ File is missing on the server — delete this item and
                        upload it again (or use a YouTube link)
                      </span>
                    )}
                    <span
                      style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}
                    >
                      Order: {item.sort_order}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexShrink: 0,
                    alignItems: "center",
                  }}
                >
                  {/* Quiz Generator button — main new feature */}
                  <button
                    className="btn btn-sm"
                    onClick={() => setQuizItem(item)}
                    title="Generate quiz questions from this content"
                    style={{
                      background: "#ede9fe",
                      color: "#6d28d9",
                      border: "1px solid #c4b5fd",
                      fontWeight: 700,
                    }}
                  >
                    🧠 Quiz
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleToggleActive(item)}
                    title={item.is_active ? "Deactivate" : "Activate"}
                  >
                    {item.is_active ? "⏸" : "▶"}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => openEdit(item)}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDelete(item)}
                    disabled={deleting === item.id}
                    style={{ color: "var(--danger)" }}
                    title="Delete"
                  >
                    {deleting === item.id ? <Spinner size="sm" /> : "🗑"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add / Edit content modal ── */}
      {showForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowForm(false);
              resetForm();
            }
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 16,
              width: "100%",
              maxWidth: 560,
              boxShadow: "var(--shadow-xl)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--gray-100)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3 style={{ fontSize: "1.1rem", color: "var(--gray-800)" }}>
                {editItem
                  ? "✏️ Edit Content"
                  : formMode === "url"
                    ? "🎬 Add Video URL"
                    : "📁 Upload File"}
              </h3>
              <button
                className="btn-icon"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} style={{ padding: 24 }}>
              {!editItem && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginBottom: 20,
                    background: "var(--gray-50)",
                    borderRadius: 10,
                    padding: 4,
                  }}
                >
                  {[
                    ["url", "🎬 Video URL"],
                    ["upload", "📁 Upload File"],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setFormMode(mode);
                        setFile(null);
                      }}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "none",
                        cursor: "pointer",
                        background: formMode === mode ? "white" : "transparent",
                        color:
                          formMode === mode
                            ? "var(--primary)"
                            : "var(--gray-500)",
                        fontWeight: formMode === mode ? 700 : 400,
                        boxShadow:
                          formMode === mode ? "var(--shadow-sm)" : "none",
                        fontSize: "0.875rem",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  Title <span className="required-mark">*</span>
                </label>
                <input
                  className="form-input"
                  value={form.title}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="e.g. HSE Induction Video 2024"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Brief description of the content..."
                  rows={2}
                  style={{ minHeight: 70 }}
                />
              </div>

              {/* Key Points — used to generate quiz questions */}
              <div className="form-group">
                <label className="form-label">
                  🤖 Key Safety Points
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--gray-400)",
                      fontWeight: 400,
                      marginLeft: 6,
                    }}
                  >
                    used to generate quiz questions
                  </span>
                </label>
                <textarea
                  className="form-textarea"
                  value={form.key_points}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, key_points: e.target.value }))
                  }
                  placeholder={
                    "List key safety points, one per line:\n- Always wear a hard hat in construction zones\n- Fire exits must remain clear at all times\n- Report all near-miss incidents immediately"
                  }
                  rows={5}
                  style={{
                    minHeight: 120,
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                  }}
                />
                <span className="form-hint">
                  {formMode === "upload" && file?.type === "application/pdf"
                    ? "✨ PDF text is also auto-extracted and combined with these key points"
                    : "The quiz generator reads these points to create relevant questions"}
                </span>
              </div>

              {formMode === "url" && (
                <div className="form-group">
                  <label className="form-label">
                    Video URL <span className="required-mark">*</span>
                  </label>
                  <input
                    className="form-input"
                    type="url"
                    value={form.url}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, url: e.target.value }))
                    }
                    placeholder="https://youtube.com/watch?v=..."
                    required={!editItem}
                  />
                  <span className="form-hint">
                    Supports YouTube, Vimeo, or any direct video URL
                  </span>
                </div>
              )}

              {formMode === "upload" && !editItem && (
                <div className="form-group">
                  <label className="form-label">
                    File <span className="required-mark">*</span>
                  </label>
                  <div
                    style={{
                      border: "2px dashed var(--gray-300)",
                      borderRadius: 10,
                      padding: "20px 16px",
                      textAlign: "center",
                      cursor: "pointer",
                      background: file ? "var(--success-bg)" : "var(--gray-50)",
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,video/*"
                      style={{ display: "none" }}
                      onChange={(e) => setFile(e.target.files[0] || null)}
                    />
                    {file ? (
                      <div>
                        <span style={{ fontSize: "2rem" }}>
                          {file.type === "application/pdf" ? "📄" : "🎬"}
                        </span>
                        <p
                          style={{
                            fontWeight: 600,
                            color: "var(--success)",
                            marginTop: 4,
                          }}
                        >
                          {file.name}
                        </p>
                        <p
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--gray-500)",
                          }}
                        >
                          {(file.size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </div>
                    ) : (
                      <div>
                        <span style={{ fontSize: "2rem" }}>📁</span>
                        <p style={{ color: "var(--gray-500)", marginTop: 4 }}>
                          Click to select PDF or video file
                        </p>
                        <p
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--gray-400)",
                          }}
                        >
                          PDF or MP4 (H.264) — plays on every phone. Avoid AVI /
                          MOV.
                        </p>
                        <p
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--gray-400)",
                          }}
                        >
                          Tip: a YouTube (unlisted) link is more reliable than
                          uploading a video.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Language</label>
                  <select
                    className="form-select"
                    value={form.language}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, language: e.target.value }))
                    }
                  >
                    <option value="all">🌐 All Languages</option>
                    <option value="en">🇬🇧 English</option>
                    <option value="fr">🇫🇷 French</option>
                    <option value="rw">🇷🇼 Kinyarwanda</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Sort Order</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={form.sort_order}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, sort_order: e.target.value }))
                    }
                  />
                  <span className="form-hint">Lower = shown first</span>
                </div>
              </div>

              {formMode === "url" && (
                <div className="form-group">
                  <label className="form-label">
                    Duration (seconds) — optional
                  </label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={form.duration_seconds}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        duration_seconds: e.target.value,
                      }))
                    }
                    placeholder="e.g. 420 for 7 min"
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-full"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={saving}
                >
                  {saving ? <Spinner size="sm" /> : "💾"}{" "}
                  {editItem ? "Update" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Quiz Manager Modal ── */}
      {quizItem && (
        <QuizManagerModal
          item={quizItem}
          onClose={() => setQuizItem(null)}
          onApproved={() => {
            load();
          }}
        />
      )}
    </div>
  );
}
