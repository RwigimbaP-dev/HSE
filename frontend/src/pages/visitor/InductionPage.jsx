import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import ProgressBar from "../../components/ProgressBar";
import Spinner from "../../components/Spinner";
import PdfViewer from "../../components/PdfViewer";
import { inductionAPI } from "../../api";

const STEPS_EN = ["Register", "HSE Video", "Assessment", "Check-In"];
const STEPS_FR = ["Inscription", "Vidéo HSE", "Évaluation", "Entrée"];
const STEPS_RW = ["Kwiyandikisha", "Videwo", "Ikizami", "Kwinjira"];
function getSteps(lang) {
  if (lang === "fr") return STEPS_FR;
  if (lang === "rw") return STEPS_RW;
  return STEPS_EN;
}

// ─── Built-in fallback slides (used when no admin content exists) ─────────────
function getBuiltInSlides(t, lang) {
  const isFr = lang === "fr";
  const isRw = lang === "rw";
  return [
    {
      icon: "🚨",
      title: t("video_topic1"),
      points: [
        isFr
          ? "Évacuez immédiatement par la sortie la plus proche"
          : isRw
            ? "Sohoha ako kanya ukoresheje inzira y'ubutabazi"
            : "Evacuate immediately via the nearest emergency exit",
        isFr
          ? "Suivez les panneaux verts d'évacuation"
          : isRw
            ? "Kurikira ibimenyetso bya green"
            : "Follow the green evacuation signs to the muster point",
        isFr
          ? "Ne jamais utiliser les ascenseurs"
          : isRw
            ? "Ntukoresha elevator mu gihe cy'ibibazo"
            : "Never use elevators during an emergency",
        isFr
          ? "Signalez les personnes manquantes au warden"
          : isRw
            ? "Bitsa abantu bagiye kuri warden"
            : "Report any missing persons to the assembly warden",
      ],
    },
    {
      icon: "🦺",
      title: t("video_topic2"),
      points: [
        isFr
          ? "Portez les EPI appropriés dans les zones désignées"
          : isRw
            ? "Ambara PPE ikwiye mu turere twagenewe"
            : "Wear appropriate PPE in all designated areas",
        isFr
          ? "Casques obligatoires sur les chantiers"
          : isRw
            ? "Ingofero zirasabwa mu bikorwa by'ubwubatsi"
            : "Hard hats are mandatory in construction zones",
        isFr
          ? "Chaussures de sécurité en zone opérationnelle"
          : isRw
            ? "Inkweto z'umutekano zirasabwa"
            : "Safety boots must be worn in operational areas",
        isFr
          ? "Signalez tout EPI endommagé"
          : isRw
            ? "Bitsa PPE yononeka"
            : "Report any damaged PPE immediately",
      ],
    },
    {
      icon: "🔥",
      title: t("video_topic3"),
      points: [
        isFr
          ? "Localisez l'extincteur le plus proche"
          : isRw
            ? "Menya inshinge yo kuzimya umuriro iri hafi"
            : "Locate the nearest fire extinguisher",
        isFr
          ? "Méthode PASS: Tirer, Viser, Presser, Balayer"
          : isRw
            ? "Uburyo PASS: Kura, Saba, Kanda, Kanura"
            : "Use PASS method: Pull, Aim, Squeeze, Sweep",
        isFr
          ? "Ne jamais éteindre seul un grand incendie"
          : isRw
            ? "Ntukagerageze kuzimya umuriro munini wenyine"
            : "Never fight a large fire alone — evacuate first",
        isFr
          ? "Gardez les sorties dégagées en tout temps"
          : isRw
            ? "Bika inzira z'ubutabazi zifunguye igihe cose"
            : "Keep all fire exits clear and unobstructed",
      ],
    },
    {
      icon: "⚠️",
      title: t("video_topic4"),
      points: [
        isFr
          ? "Signalez tous les accidents immédiatement"
          : isRw
            ? "Bitsa impanuka zose ako kanya"
            : "Report all accidents to your supervisor immediately",
        isFr
          ? "Documentez: quoi, quand, où"
          : isRw
            ? "Andika: niki, ryari, hehe"
            : "Document the incident: what, when, where, who",
        isFr
          ? "Signalez également les quasi-accidents"
          : isRw
            ? "Bitsa no ikibazo cyageze gusa"
            : "Near-miss incidents must also be reported",
        isFr
          ? "Ne déplacez pas la scène de l'accident"
          : isRw
            ? "Ntukavone aho impanuka yabereye"
            : "Do not disturb the accident scene",
      ],
    },
    {
      icon: "🔒",
      title: t("video_topic6"),
      points: [
        isFr
          ? "Portez votre badge visiteur en permanence"
          : isRw
            ? "Ambara akabati kawe igihe cose"
            : "Wear your visitor badge visibly at all times",
        isFr
          ? "Restez avec votre hôte désigné"
          : isRw
            ? "Guma n'umuyobozi wawe igihe cose"
            : "Always remain with your designated host",
        isFr
          ? "Pas de photos en zones sensibles"
          : isRw
            ? "Ntufotore mu turere dufite ibanga"
            : "No photography in restricted or sensitive areas",
        isFr
          ? "Signalez toute personne sans badge"
          : isRw
            ? "Bitsa umuntu udafite akabati"
            : "Report any person without a visible badge to security",
      ],
    },
    {
      icon: "📋",
      title: t("video_topic7"),
      points: [
        isFr
          ? "Suivez toutes les consignes de sécurité"
          : isRw
            ? "Kurikira amabwiriza yose y'umutekano"
            : "Follow all safety instructions from staff",
        isFr
          ? "Pas de téléphone en zone restreinte"
          : isRw
            ? "Ntukoresha telefone mu turere tuziguye"
            : "No mobile phone use in restricted zones",
        isFr
          ? "Pas de tabac sauf en zones désignées"
          : isRw
            ? "Kunywa itabi ahantu hagenwe gusa"
            : "No smoking except in designated areas",
        isFr
          ? "Respectez tous les panneaux de sécurité"
          : isRw
            ? "Kubaha ibimenyetso bya HSE"
            : "Respect all safety signs and floor markings",
      ],
    },
  ];
}

export default function InductionPage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const visitor = location.state?.visitor;

  const [adminContent, setAdminContent] = useState([]);
  const [loadingContent, setLoadingContent] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [itemsViewed, setItemsViewed] = useState(new Set([0]));
  const [slideIndex, setSlideIndex] = useState(0);
  const [slidesViewed, setSlidesViewed] = useState(new Set([0]));
  const [autoPlay, setAutoPlay] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [minProgress, setMinProgress] = useState(80); // admin-configurable
  const timerRef = useRef(null);

  useEffect(() => {
    if (!visitor) navigate("/visitor/register");
  }, [visitor, navigate]);

  useEffect(() => {
    (async () => {
      try {
        const res = await inductionAPI.getActive(language);
        setAdminContent(res.data.content || []);
      } catch {
        setAdminContent([]);
      } finally {
        setLoadingContent(false);
      }
    })();
  }, [language]);

  useEffect(() => {
    inductionAPI
      .getSettings()
      .then((r) => {
        if (Number.isFinite(r.data.min_watch_percent))
          setMinProgress(r.data.min_watch_percent);
      })
      .catch(() => {});
  }, []);

  // Reset viewed state when content changes
  useEffect(() => {
    setItemsViewed(new Set([0]));
    setSlideIndex(0);
    setSlidesViewed(new Set([0]));
    setCurrentIndex(0);
    setElapsed(0);
    setAutoPlay(false);
  }, [adminContent.length]);

  const builtInSlides = getBuiltInSlides(t, language);
  const hasAdminContent = adminContent.length > 0;
  const totalItems = hasAdminContent
    ? adminContent.length
    : builtInSlides.length;

  // Progress calculation
  const progress = Math.min(
    Math.round(
      hasAdminContent
        ? (itemsViewed.size / totalItems) * 100
        : (slidesViewed.size / builtInSlides.length) * 100,
    ),
    100,
  );

  const canProceed = progress >= minProgress;

  // Auto-play timer for built-in slides
  useEffect(() => {
    if (!hasAdminContent && autoPlay) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          const secsPerSlide = 12;
          const total = builtInSlides.length * secsPerSlide;
          if (next >= total) {
            clearInterval(timerRef.current);
            setAutoPlay(false);
            setSlidesViewed(new Set(builtInSlides.map((_, i) => i)));
            setSlideIndex(builtInSlides.length - 1);
            return total;
          }
          const si = Math.min(
            Math.floor(next / secsPerSlide),
            builtInSlides.length - 1,
          );
          setSlideIndex(si);
          setSlidesViewed((prev2) => new Set([...prev2, si]));
          return next;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [autoPlay, hasAdminContent, builtInSlides.length]);

  const goSlide = (i) => {
    setSlideIndex(i);
    setSlidesViewed((prev) => new Set([...prev, i]));
  };

  const markAdminItemViewed = (i) => {
    setItemsViewed((prev) => new Set([...prev, i]));
  };

  const currentAdminItem = hasAdminContent ? adminContent[currentIndex] : null;
  const currentSlide = !hasAdminContent ? builtInSlides[slideIndex] : null;

  if (!visitor) return null;

  return (
    <div className="visitor-page">
      <div className="visitor-header">
        <div className="visitor-logo">🦺</div>
        <h1>{t("video_title")}</h1>
        <p>{t("video_subtitle")}</p>
      </div>

      <div className="visitor-card">
        <div className="visitor-card-header">
          <ProgressBar steps={getSteps(language)} current={2} />
        </div>

        <div className="visitor-card-body">
          {loadingContent ? (
            <div
              className="flex-center"
              style={{ padding: "40px 0", flexDirection: "column", gap: 12 }}
            >
              <Spinner size="lg" />
              <p style={{ color: "var(--gray-500)" }}>{t("loading")}</p>
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "var(--gray-600)",
                    }}
                  >
                    {t("video_progress")}:{" "}
                    <strong style={{ color: "var(--primary)" }}>
                      {progress}% {t("video_watched")}
                    </strong>
                  </span>
                  <span
                    style={{ fontSize: "0.8rem", color: "var(--gray-500)" }}
                  >
                    {hasAdminContent
                      ? `${currentIndex + 1} / ${totalItems}`
                      : `${t("video_slide_progress")} ${slideIndex + 1} ${t("video_of")} ${builtInSlides.length}`}
                  </span>
                </div>
                <div className="video-progress-bar">
                  <div
                    className="video-progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {canProceed ? (
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--success)",
                      marginTop: 4,
                    }}
                  >
                    ✅ {t("video_complete")}
                  </p>
                ) : (
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--warning)",
                      marginTop: 4,
                    }}
                  >
                    ⚠ {t("video_instruction")}
                  </p>
                )}
              </div>

              {/* ── Admin-managed content ── */}
              {hasAdminContent && currentAdminItem && (
                <div>
                  {/* Content tabs */}
                  {adminContent.length > 1 && (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        marginBottom: 14,
                        flexWrap: "wrap",
                      }}
                    >
                      {adminContent.map((item, i) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setCurrentIndex(i);
                            markAdminItemViewed(i);
                          }}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 20,
                            border: "1.5px solid",
                            borderColor:
                              i === currentIndex
                                ? "var(--primary)"
                                : "var(--gray-200)",
                            background:
                              i === currentIndex ? "var(--primary)" : "white",
                            color:
                              i === currentIndex ? "white" : "var(--gray-600)",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            position: "relative",
                          }}
                        >
                          {itemsViewed.has(i) && (
                            <span style={{ marginRight: 4 }}>✓</span>
                          )}
                          {item.type === "pdf" ? "📄" : "🎬"} {item.title}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Video URL (YouTube / Vimeo embed) */}
                  {currentAdminItem.type === "video_url" &&
                    currentAdminItem.embed_url && (
                      <div
                        style={{
                          position: "relative",
                          paddingBottom: "56.25%",
                          borderRadius: 12,
                          overflow: "hidden",
                          background: "#000",
                          marginBottom: 12,
                        }}
                      >
                        <iframe
                          src={currentAdminItem.embed_url}
                          title={currentAdminItem.title}
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            border: "none",
                          }}
                          allowFullScreen
                          onLoad={() => markAdminItemViewed(currentIndex)}
                        />
                      </div>
                    )}

                  {/* Uploaded video */}
                  {currentAdminItem.type === "video_upload" &&
                    currentAdminItem.file_url && (
                      <div
                        style={{
                          borderRadius: 12,
                          overflow: "hidden",
                          background: "#000",
                          marginBottom: 12,
                        }}
                      >
                        <video
                          controls
                          style={{
                            width: "100%",
                            maxHeight: 380,
                            display: "block",
                          }}
                          onPlay={() => markAdminItemViewed(currentIndex)}
                          onTimeUpdate={(e) => {
                            const { currentTime, duration } = e.target;
                            if (duration && currentTime / duration >= 0.8)
                              markAdminItemViewed(currentIndex);
                          }}
                        >
                          <source src={currentAdminItem.file_url} />
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    )}

                  {/* PDF document — use PdfViewer which fetches via blob URL to avoid CSP/COEP blocks */}
                  {currentAdminItem.type === "pdf" &&
                    currentAdminItem.file_url && (
                      <div
                        style={{
                          borderRadius: 12,
                          overflow: "hidden",
                          border: "1px solid var(--gray-200)",
                          marginBottom: 12,
                        }}
                      >
                        <PdfViewer
                          src={currentAdminItem.file_url}
                          title={currentAdminItem.title}
                          height={480}
                          onLoad={() => markAdminItemViewed(currentIndex)}
                        />
                        <div
                          style={{
                            padding: "10px 14px",
                            background: "var(--gray-50)",
                            borderTop: "1px solid var(--gray-200)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--gray-500)",
                            }}
                          >
                            📄 {currentAdminItem.file_name}
                          </span>
                          <a
                            href={currentAdminItem.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: "0.8rem" }}
                          >
                            ↗ Open in new tab
                          </a>
                        </div>
                      </div>
                    )}

                  {currentAdminItem.description && (
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--gray-600)",
                        marginBottom: 12,
                      }}
                    >
                      {currentAdminItem.description}
                    </p>
                  )}

                  {/* Mark as viewed button */}
                  <button
                    className={`btn btn-sm btn-full ${itemsViewed.has(currentIndex) ? "btn-ghost" : "btn-outline"}`}
                    style={{ marginBottom: 12 }}
                    onClick={() => markAdminItemViewed(currentIndex)}
                  >
                    {itemsViewed.has(currentIndex)
                      ? "✅ Viewed"
                      : "👁 Mark as Viewed"}
                  </button>

                  {/* Prev / Next */}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const i = Math.max(0, currentIndex - 1);
                        setCurrentIndex(i);
                        markAdminItemViewed(i);
                      }}
                      disabled={currentIndex === 0}
                    >
                      ← Previous
                    </button>
                    <div style={{ flex: 1 }} />
                    {currentIndex < adminContent.length - 1 && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          const i = currentIndex + 1;
                          setCurrentIndex(i);
                          markAdminItemViewed(i);
                        }}
                      >
                        Next →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Built-in slides fallback ── */}
              {!hasAdminContent && currentSlide && (
                <div>
                  <div className="hse-slide">
                    <div>
                      <div className="slide-icon">{currentSlide.icon}</div>
                      <div className="slide-title">{currentSlide.title}</div>
                      <ul className="slide-points">
                        {currentSlide.points.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
                      {builtInSlides.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => goSlide(i)}
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background:
                              i === slideIndex
                                ? "white"
                                : "rgba(255,255,255,0.35)",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      marginTop: 10,
                    }}
                  >
                    {builtInSlides.map((_, i) => (
                      <span
                        key={i}
                        onClick={() => goSlide(i)}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          background: slidesViewed.has(i)
                            ? "var(--success-bg)"
                            : "var(--gray-100)",
                          color: slidesViewed.has(i)
                            ? "var(--success)"
                            : "var(--gray-400)",
                          border: `1px solid ${slidesViewed.has(i) ? "#9ae6b4" : "var(--gray-200)"}`,
                        }}
                      >
                        {slidesViewed.has(i) ? "✓" : i + 1} Slide {i + 1}
                      </span>
                    ))}
                  </div>

                  <div className="slide-nav" style={{ marginTop: 12 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => goSlide(slideIndex - 1)}
                      disabled={slideIndex === 0}
                    >
                      ← {t("back")}
                    </button>
                    <div style={{ display: "flex", gap: 8 }}>
                      {!autoPlay ? (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setAutoPlay(true)}
                          disabled={elapsed >= builtInSlides.length * 12}
                        >
                          ▶ Auto Play
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setAutoPlay(false)}
                        >
                          ⏸ Pause
                        </button>
                      )}
                      {slideIndex < builtInSlides.length - 1 && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => goSlide(slideIndex + 1)}
                        >
                          {t("next")} →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Proceed button */}
              <div style={{ marginTop: 20 }}>
                <button
                  className="btn btn-success btn-lg btn-full"
                  onClick={() =>
                    navigate("/visitor/quiz", { state: { visitor } })
                  }
                  disabled={!canProceed}
                >
                  ▶ {t("video_proceed")}
                </button>
                {!canProceed && (
                  <p
                    style={{
                      textAlign: "center",
                      fontSize: "0.8rem",
                      color: "var(--gray-500)",
                      marginTop: 8,
                    }}
                  >
                    {t("video_not_ready")}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
