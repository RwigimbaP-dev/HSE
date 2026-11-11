import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import ProgressBar from "../../components/ProgressBar";
import Spinner from "../../components/Spinner";
import { quizAPI } from "../../api";
import toast from "react-hot-toast";

const STEPS_EN = ["Register", "HSE Video", "Assessment", "Check-In"];
const STEPS_FR = ["Inscription", "Vidéo HSE", "Évaluation", "Entrée"];
const STEPS_RW = ["Kwiyandikisha", "Videwo", "Ikizami", "Kwinjira"];
function getSteps(lang) {
  if (lang === "fr") return STEPS_FR;
  if (lang === "rw") return STEPS_RW;
  return STEPS_EN;
}
const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function QuizPage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const visitor = location.state?.visitor;
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // { questionId: selectedIndex }
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(1);
  const [passScore, setPassScore] = useState(80); // set by the admin

  // Fills {total}, {pass} and {need} in the translated texts
  const fmt = (str, total = questions.length) =>
    String(str)
      .replace(/\{total\}/g, total)
      .replace(/\{pass\}/g, passScore)
      .replace(/\{need\}/g, Math.max(1, Math.ceil((total * passScore) / 100)));

  useEffect(() => {
    if (!visitor) {
      navigate("/visitor/register");
      return;
    }
    loadQuiz();
  }, [visitor, language]);

  const loadQuiz = async () => {
    setLoading(true);
    setAnswers({});
    setResult(null);
    try {
      const res = await quizAPI.generate(visitor.id, language);
      setQuestions(res.data.questions);
      if (res.data.pass_score) setPassScore(res.data.pass_score);
    } catch (err) {
      toast.error("Failed to load quiz questions. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (questionId, optionIndex) => {
    if (result) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleSubmit = async () => {
    const unanswered = questions.filter((q) => answers[q.id] === undefined);
    if (unanswered.length > 0) {
      toast.error(t("quiz_select_answer"));
      return;
    }

    setSubmitting(true);
    try {
      const answerPayload = questions.map((q) => ({
        question_id: q.id,
        selected: answers[q.id],
      }));
      const res = await quizAPI.submit(visitor.id, language, answerPayload);
      setResult(res.data);
      if (res.data.pass_score) setPassScore(res.data.pass_score);
      if (res.data.passed) {
        toast.success("🎉 " + res.data.message);
      } else {
        toast.error(res.data.message);
      }
    } catch (err) {
      toast.error("Failed to submit quiz. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setAttempt((a) => a + 1);
    loadQuiz();
  };

  const handleProceed = () => {
    // Update visitor with passed status before navigating
    const updatedVisitor = {
      ...visitor,
      induction_status: "passed",
      quiz_score: result.percentage,
    };
    navigate("/visitor/checkin", { state: { visitor: updatedVisitor } });
  };

  const answeredCount = Object.keys(answers).length;

  if (!visitor) return null;

  return (
    <div className="visitor-page">
      <div className="visitor-header">
        <div className="visitor-logo">📝</div>
        <h1>{t("quiz_title")}</h1>
        <p>{fmt(t("quiz_subtitle"))}</p>
      </div>

      <div className="visitor-card">
        <div className="visitor-card-header">
          <ProgressBar steps={getSteps(language)} current={3} />
        </div>

        <div className="visitor-card-body">
          {loading ? (
            <div
              className="flex-center"
              style={{ padding: "48px 0", flexDirection: "column", gap: 16 }}
            >
              <Spinner size="lg" />
              <p style={{ color: "var(--gray-500)", fontSize: "0.9rem" }}>
                {t("loading")}
              </p>
            </div>
          ) : result ? (
            /* ===== RESULTS VIEW ===== */
            <div>
              <div className="result-card">
                <div
                  className={`result-score-circle ${result.passed ? "pass" : "fail"}`}
                >
                  <span className="score-number">{result.percentage}%</span>
                  <span className="score-label">{t("quiz_score")}</span>
                </div>

                <h2
                  style={{
                    marginBottom: 10,
                    color: result.passed ? "var(--success)" : "var(--danger)",
                  }}
                >
                  {result.passed
                    ? "🎉 " + t("quiz_pass")
                    : "❌ " + t("quiz_fail")}
                </h2>

                <div
                  className={`alert ${result.passed ? "alert-success" : "alert-danger"}`}
                >
                  {result.passed
                    ? t("quiz_pass_msg")
                    : fmt(t("quiz_fail_msg"), result.total)}
                </div>

                <p
                  style={{
                    color: "var(--gray-500)",
                    fontSize: "0.875rem",
                    marginBottom: 4,
                  }}
                >
                  {t("quiz_score")}:{" "}
                  <strong>
                    {result.score}/{result.total}
                  </strong>{" "}
                  &nbsp;|&nbsp;
                  {t("quiz_attempt")}: <strong>{attempt}</strong>
                </p>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--gray-400)",
                    marginBottom: 24,
                  }}
                >
                  {fmt(t("quiz_pass_score"), result.total)}
                </p>
              </div>

              {/* Answer review */}
              <div style={{ marginBottom: 24 }}>
                {result.results?.map((r, idx) => {
                  const question = questions[idx];
                  if (!question) return null;
                  return (
                    <div
                      key={r.question_id}
                      style={{
                        background: r.correct
                          ? "var(--success-bg)"
                          : "var(--danger-bg)",
                        borderRadius: 10,
                        padding: "14px 16px",
                        marginBottom: 10,
                        border: `1px solid ${r.correct ? "#9ae6b4" : "#feb2b2"}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ fontSize: "1.1rem" }}>
                          {r.correct ? "✅" : "❌"}
                        </span>
                        <p
                          style={{
                            fontWeight: 600,
                            fontSize: "0.9rem",
                            color: "var(--gray-800)",
                            lineHeight: 1.4,
                          }}
                        >
                          {idx + 1}. {question.text}
                        </p>
                      </div>
                      <p
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--gray-600)",
                          marginLeft: 30,
                        }}
                      >
                        <strong>{t("quiz_correct")}:</strong>{" "}
                        {question.options[r.correct_answer]}
                      </p>
                      {r.explanation && (
                        <p
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--gray-500)",
                            marginLeft: 30,
                            marginTop: 4,
                            fontStyle: "italic",
                          }}
                        >
                          💡 {r.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action buttons */}
              {result.passed ? (
                <button
                  className="btn btn-success btn-lg btn-full"
                  onClick={handleProceed}
                >
                  ✓ {t("quiz_proceed")}
                </button>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <button
                    className="btn btn-primary btn-lg btn-full"
                    onClick={handleRetry}
                  >
                    🔄 {t("quiz_retry")}
                  </button>
                  <button
                    className="btn btn-ghost btn-full"
                    onClick={() =>
                      navigate("/visitor/induction", { state: { visitor } })
                    }
                  >
                    ← Review HSE Induction
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ===== QUIZ VIEW ===== */
            <div>
              {/* Progress indicator */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--gray-50)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 20,
                  border: "1px solid var(--gray-200)",
                }}
              >
                <span
                  style={{ fontSize: "0.875rem", color: "var(--gray-600)" }}
                >
                  {answeredCount}/{questions.length} {t("quiz_answered")}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  {questions.map((q, i) => (
                    <div
                      key={q.id}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background:
                          answers[q.id] !== undefined
                            ? "var(--primary)"
                            : "var(--gray-200)",
                      }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--gray-400)" }}>
                  {fmt(t("quiz_pass_score"))}
                </span>
              </div>

              {/* Questions */}
              {questions.map((question, qIdx) => (
                <div
                  key={question.id}
                  className={`quiz-question ${answers[question.id] !== undefined ? "answered" : ""}`}
                >
                  <div className="question-header">
                    <div className="question-num">{qIdx + 1}</div>
                    <p className="question-text">{question.text}</p>
                  </div>
                  <div className="quiz-options">
                    {question.options.map((option, optIdx) => (
                      <button
                        key={optIdx}
                        className={`quiz-option ${answers[question.id] === optIdx ? "selected" : ""}`}
                        onClick={() => handleAnswer(question.id, optIdx)}
                      >
                        <span className="option-letter">
                          {OPTION_LETTERS[optIdx]}
                        </span>
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Submit */}
              <div style={{ marginTop: 24 }}>
                <button
                  className="btn btn-primary btn-lg btn-full"
                  onClick={handleSubmit}
                  disabled={submitting || answeredCount < questions.length}
                >
                  {submitting ? <Spinner size="sm" /> : <span>📤</span>}
                  {t("quiz_submit")} ({answeredCount}/{questions.length})
                </button>

                {answeredCount < questions.length && (
                  <p
                    style={{
                      textAlign: "center",
                      fontSize: "0.8rem",
                      color: "var(--gray-400)",
                      marginTop: 8,
                    }}
                  >
                    {t("quiz_select_answer")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
