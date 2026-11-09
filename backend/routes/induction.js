const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { db } = require("../database/schema");
const { authenticateAdmin } = require("../middleware/auth");
const { audit, diffObjects } = require("../utils/audit");

// ─── PDF text extraction (lazy-loaded) ───────────────────────────────────────
let pdfParse = null;
function getPdfParser() {
  if (pdfParse === null) {
    try {
      const mod = require("pdf-parse");
      // pdf-parse exports the function directly OR as .default depending on version
      pdfParse = typeof mod === "function" ? mod : mod.default || mod;
      if (typeof pdfParse !== "function") {
        console.warn(
          "  ⚠ pdf-parse loaded but export is not a function — disabling PDF extraction",
        );
        pdfParse = false;
      }
    } catch {
      console.warn(
        "  ⚠ pdf-parse not installed — PDF text extraction disabled",
      );
      pdfParse = false;
    }
  }
  return pdfParse || null;
}

// ─── OpenAI client (shared with quiz.js — lazy-loaded) ──────────────────────
let openaiClient = null;
function getOpenAI() {
  if (openaiClient === null) {
    if (process.env.OPENAI_API_KEY) {
      try {
        const { OpenAI } = require("openai");
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      } catch {
        openaiClient = false;
      }
    } else {
      openaiClient = false;
    }
  }
  return openaiClient;
}

// ─── Multer storage ───────────────────────────────────────────────────────────
const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR || "./uploads",
  "induction",
);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname);
    cb(null, `induction-${unique}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = [
    "application/pdf",
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/quicktime",
    "video/x-msvideo",
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only PDF and video files are allowed"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_MB || "100", 10) * 1024 * 1024,
  },
});

// ─── Helper: extract text from a PDF file ────────────────────────────────────
async function extractPdfText(filePath) {
  const parser = getPdfParser();
  if (!parser) return null;
  try {
    const dataBuffer = fs.readFileSync(filePath);
    // pdf-parse may return a promise or throw — handle both
    const data = await Promise.resolve(parser(dataBuffer));
    const text = (data?.text || "").replace(/\s+/g, " ").trim().slice(0, 4000);
    return text || null;
  } catch (err) {
    console.warn("PDF text extraction failed:", err.message);
    return null;
  }
}

// ─── Helper: build content context for AI quiz generation ────────────────────
function buildAIContext(contentItems) {
  if (!contentItems || contentItems.length === 0) return null;

  const parts = contentItems.map((c) => {
    const sections = [`Title: ${c.title}`];
    if (c.description) sections.push(`Description: ${c.description}`);
    if (c.key_points) sections.push(`Key Points:\n${c.key_points}`);
    if (c.content_text)
      sections.push(`Extracted Content:\n${c.content_text.slice(0, 2000)}`);
    return sections.join("\n");
  });

  return parts.join("\n\n---\n\n");
}

// ─── Helper: generate quiz questions via OpenAI or local generator ───────────
// `contentItems` is always an array of { title, description, key_points, content_text }
async function generateQuizFromContent(language, contentItems, count = 5) {
  const context = buildAIContext(contentItems);

  // 1. Try OpenAI if key is set and has credits
  const ai = getOpenAI();
  if (ai && context) {
    const langNames = { en: "English", fr: "French", rw: "Kinyarwanda" };
    const langName = langNames[language] || "English";

    const prompt = `You are an HSE (Health, Safety and Environment) training expert.
Generate exactly ${count} multiple-choice quiz questions in ${langName} based on the following induction content:

${context}

Rules:
- Each question must have exactly 4 answer options (A, B, C, D)
- Only ONE option is correct
- Questions must be drawn directly from the content above
- Questions must be clear, specific, and test understanding of the key safety points
- Make wrong options plausible but clearly incorrect to someone who studied the content
- Include a brief explanation for the correct answer
- Do NOT use generic questions — base each question on specific details from the content

Respond ONLY with valid JSON (no markdown, no extra text):
{
  "questions": [
    {
      "id": 1,
      "text": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0,
      "explanation": "Brief explanation why this is correct."
    }
  ]
}`;

    try {
      const response = await ai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 2500,
      });

      const raw = response.choices[0].message.content.trim();
      const cleaned = raw
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
      const parsed = JSON.parse(cleaned);

      if (parsed.questions && parsed.questions.length >= count) {
        return parsed.questions.slice(0, count);
      }
    } catch (err) {
      // 429 = no credits, 401 = bad key — log but don't crash, fall through to local
      const status = err?.status || err?.response?.status;
      if (status === 429) {
        console.warn(
          "⚠ OpenAI quota exhausted — falling back to local generator",
        );
      } else {
        console.error("OpenAI quiz generation failed:", err.message);
      }
    }
  }

  // 2. Local generator — reads title, description, key_points, content_text directly
  try {
    const {
      generateQuizFromContent: localGen,
    } = require("../utils/quizGenerator");
    const localQuestions = localGen(contentItems, language, count);
    if (localQuestions && localQuestions.length > 0) return localQuestions;
  } catch (err) {
    console.error("Local quiz generation failed:", err.message);
  }

  return null;
}

// ─── Induction settings ───────────────────────────────────────────────────────
// min_watch_percent = how much of the induction content a visitor must view
// before the "Proceed to quiz" button unlocks (0–100).
async function readMinWatchPercent() {
  const row = await db("system_config")
    .where({ key: "video_min_watch_percent" })
    .first();
  const n = parseInt(row?.value, 10);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 80;
}

// PUBLIC: GET /api/induction/settings
router.get("/settings", async (req, res) => {
  try {
    res.json({ success: true, min_watch_percent: await readMinWatchPercent() });
  } catch (err) {
    res.json({ success: true, min_watch_percent: 80 });
  }
});

// ADMIN: PUT /api/induction/settings
router.put("/settings", authenticateAdmin, async (req, res) => {
  try {
    const n = parseInt(req.body.min_watch_percent, 10);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return res
        .status(400)
        .json({ success: false, message: "Enter a number between 0 and 100" });
    }
    const exists = await db("system_config")
      .where({ key: "video_min_watch_percent" })
      .first();
    if (exists)
      await db("system_config")
        .where({ key: "video_min_watch_percent" })
        .update({ value: String(n) });
    else
      await db("system_config").insert({
        key: "video_min_watch_percent",
        value: String(n),
      });
    await audit(req, {
      action: "settings.update",
      category: "system",
      entity_type: "setting",
      entity_label: "Required viewing %",
      before: { min_watch_percent: exists ? Number(exists.value) : null },
      after: { min_watch_percent: n },
    });
    res.json({ success: true, min_watch_percent: n });
  } catch (err) {
    console.error("Save settings error:", err);
    res.status(500).json({ success: false, message: "Failed to save setting" });
  }
});

// ─── PUBLIC: GET /api/induction/active ────────────────────────────────────────
router.get("/active", async (req, res) => {
  try {
    const { language = "en" } = req.query;
    const content = await db("induction_content")
      .where({ is_active: true })
      .where(function () {
        this.where({ language }).orWhere({ language: "all" });
      })
      .orderBy("sort_order", "asc")
      .orderBy("created_at", "desc");

    const processed = content.map((item) => ({
      ...item,
      embed_url: item.type === "video_url" ? getEmbedUrl(item.url) : null,
      file_url: item.file_path ? `/api/induction/file/${item.id}` : null,
    }));

    res.json({ success: true, content: processed, total: processed.length });
  } catch (err) {
    console.error("Induction fetch error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUBLIC: GET /api/induction/file/:id ──────────────────────────────────────
router.get("/file/:id", async (req, res) => {
  try {
    const item = await db("induction_content")
      .where({ id: req.params.id })
      .first();
    if (!item || !item.file_path) {
      return res
        .status(404)
        .json({ success: false, message: "File not found" });
    }

    const filePath = path.resolve(item.file_path);
    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ success: false, message: "File missing on disk" });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (range && item.mime_type?.startsWith("video/")) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": item.mime_type,
        "X-Frame-Options": "SAMEORIGIN",
        "Cross-Origin-Resource-Policy": "cross-origin",
      });
      fileStream.pipe(res);
    } else {
      res.setHeader(
        "Content-Type",
        item.mime_type || "application/octet-stream",
      );
      res.setHeader("Content-Length", fileSize);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(item.file_name)}"`,
      );
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/induction — list all content ────────────────────────────────────
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const content = await db("induction_content")
      .orderBy("sort_order", "asc")
      .orderBy("created_at", "desc");

    const processed = content.map((item) => ({
      ...item,
      file_url: item.file_path ? `/api/induction/file/${item.id}` : null,
      embed_url: item.type === "video_url" ? getEmbedUrl(item.url) : null,
      // Include content extraction status for the admin UI
      has_content_text: !!(item.content_text && item.content_text.trim()),
      has_key_points: !!(item.key_points && item.key_points.trim()),
    }));

    res.json({ success: true, content: processed, total: processed.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/induction/url — add video URL ─────────────────────────────────
router.post("/url", authenticateAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      url,
      language = "all",
      duration_seconds,
      sort_order = 0,
      key_points,
    } = req.body;

    if (!title || !url) {
      return res
        .status(400)
        .json({ success: false, message: "title and url are required" });
    }

    const [id] = await db("induction_content")
      .insert({
        title,
        description: description || null,
        type: "video_url",
        language,
        url,
        duration_seconds: duration_seconds || null,
        sort_order: parseInt(sort_order, 10),
        is_active: true,
        key_points: key_points || null,
      })
      .returning("id");

    const item = await db("induction_content")
      .where({ id: id.id ?? id })
      .first();
    await audit(req, {
      action: "induction.create",
      category: "induction",
      entity_type: "induction_content",
      entity_id: item.id,
      entity_label: item.title,
      details: { type: "video_url", language: item.language, url: item.url },
    });
    res.json({ success: true, content: item });
  } catch (err) {
    console.error("Add URL error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/induction/upload — upload PDF or video ────────────────────────
router.post(
  "/upload",
  authenticateAdmin,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });
      }

      const {
        title,
        description,
        language = "all",
        sort_order = 0,
        key_points,
      } = req.body;
      if (!title) {
        fs.unlinkSync(req.file.path);
        return res
          .status(400)
          .json({ success: false, message: "title is required" });
      }

      const fileType = req.file.mimetype.startsWith("video/")
        ? "video_upload"
        : "pdf";

      // Auto-extract text from PDFs
      let contentText = null;
      if (fileType === "pdf") {
        contentText = await extractPdfText(req.file.path);
        if (contentText) {
          console.log(
            `  ✔ Extracted ${contentText.length} chars from PDF: ${req.file.originalname}`,
          );
        }
      }

      const [id] = await db("induction_content")
        .insert({
          title,
          description: description || null,
          type: fileType,
          language,
          file_path: req.file.path,
          file_name: req.file.originalname,
          file_size: req.file.size,
          mime_type: req.file.mimetype,
          sort_order: parseInt(sort_order, 10),
          is_active: true,
          content_text: contentText,
          key_points: key_points || null,
        })
        .returning("id");

      const item = await db("induction_content")
        .where({ id: id.id ?? id })
        .first();
      await audit(req, {
        action: "induction.create",
        category: "induction",
        entity_type: "induction_content",
        entity_id: item.id,
        entity_label: item.title,
        details: {
          type: item.type,
          file: item.file_name,
          size: item.file_size,
          language: item.language,
        },
      });
      res.json({
        success: true,
        content: {
          ...item,
          file_url: `/api/induction/file/${item.id}`,
          has_content_text: !!(contentText && contentText.trim()),
        },
        contentExtracted: !!contentText,
      });
    } catch (err) {
      console.error("Upload error:", err);
      if (req.file?.path)
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── PUT /api/induction/:id — update metadata ────────────────────────────────
router.put("/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      language,
      url,
      duration_seconds,
      sort_order,
      is_active,
      key_points,
    } = req.body;

    const item = await db("induction_content").where({ id }).first();
    if (!item)
      return res.status(404).json({ success: false, message: "Not found" });

    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (language !== undefined) updates.language = language;
    if (url !== undefined) updates.url = url;
    if (duration_seconds !== undefined)
      updates.duration_seconds = duration_seconds;
    if (sort_order !== undefined) updates.sort_order = parseInt(sort_order, 10);
    if (is_active !== undefined) updates.is_active = is_active;
    if (key_points !== undefined) updates.key_points = key_points;

    await db("induction_content").where({ id }).update(updates);
    const updated = await db("induction_content").where({ id }).first();
    const d = diffObjects(item, updated, [
      "title",
      "description",
      "language",
      "url",
      "duration_seconds",
      "sort_order",
      "is_active",
      "key_points",
    ]);
    if (d.changed.length) {
      await audit(req, {
        action:
          d.changed.length === 1 && d.changed[0] === "is_active"
            ? updated.is_active
              ? "induction.activate"
              : "induction.deactivate"
            : "induction.update",
        category: "induction",
        entity_type: "induction_content",
        entity_id: item.id,
        entity_label: updated.title,
        before: d.before,
        after: d.after,
      });
    }
    res.json({ success: true, content: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/induction/:id/extract — re-extract PDF text ──────────────────
router.post("/:id/extract", authenticateAdmin, async (req, res) => {
  try {
    const item = await db("induction_content")
      .where({ id: req.params.id })
      .first();
    if (!item)
      return res.status(404).json({ success: false, message: "Not found" });
    if (item.type !== "pdf" || !item.file_path) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Only PDF files support text extraction",
        });
    }

    const filePath = path.resolve(item.file_path);
    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ success: false, message: "File missing on disk" });
    }

    const text = await extractPdfText(filePath);
    await db("induction_content").where({ id: item.id }).update({
      content_text: text,
      updated_at: new Date().toISOString(),
    });

    res.json({ success: true, content_text: text, length: text?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/induction/:id/preview-quiz — AI generates sample questions ────
router.post("/:id/preview-quiz", authenticateAdmin, async (req, res) => {
  try {
    const { language = "en" } = req.body;
    const item = await db("induction_content")
      .where({ id: req.params.id })
      .first();
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: "Content not found" });

    // Build context from this specific content item
    const context = buildAIContext([item]);
    if (!context) {
      return res.status(400).json({
        success: false,
        message:
          "No content available for quiz generation. Add a description or key points.",
      });
    }

    const questions = await generateQuizFromContent(language, context, 5);

    if (!questions) {
      return res.status(503).json({
        success: false,
        message:
          "AI quiz generation unavailable. Set OPENAI_API_KEY in .env to enable.",
      });
    }

    res.json({
      success: true,
      questions,
      source: "ai",
      content_title: item.title,
    });
  } catch (err) {
    console.error("Preview quiz error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/induction/preview-quiz-all ────────────────────────────────────
router.post("/preview-quiz-all", authenticateAdmin, async (req, res) => {
  try {
    const { language = "en" } = req.body;

    const contentItems = await db("induction_content")
      .where({ is_active: true })
      .where(function () {
        this.where({ language }).orWhere({ language: "all" });
      })
      .select("title", "description", "key_points", "content_text", "type")
      .orderBy("sort_order", "asc");

    if (contentItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No active content with descriptions or key points found.",
      });
    }

    const questions = await generateQuizFromContent(language, contentItems, 5);

    if (!questions) {
      return res.status(503).json({
        success: false,
        message:
          "Could not generate quiz questions. Add key safety points to your content.",
      });
    }

    res.json({ success: true, questions, source: "local" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/induction/:id ────────────────────────────────────────────────
router.delete("/:id", authenticateAdmin, async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 5) {
      return res
        .status(400)
        .json({
          success: false,
          code: "REASON_REQUIRED",
          message: "A reason (at least 5 characters) is required.",
        });
    }

    const item = await db("induction_content")
      .where({ id: req.params.id })
      .first();
    if (!item)
      return res.status(404).json({ success: false, message: "Not found" });

    const { content_text, ...snapshot } = item; // keep the audit row small
    await audit(req, {
      action: "induction.delete",
      category: "induction",
      entity_type: "induction_content",
      entity_id: item.id,
      entity_label: item.title,
      reason: reason.slice(0, 1000),
      before: snapshot,
    });

    if (item.file_path && fs.existsSync(item.file_path)) {
      try {
        fs.unlinkSync(item.file_path);
      } catch {}
    }

    await db("induction_content").where({ id: req.params.id }).delete();
    res.json({ success: true, message: "Induction content deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Helper: convert YouTube/Vimeo to embed URL ──────────────────────────────
function getEmbedUrl(url) {
  if (!url) return null;
  try {
    const ytMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    );
    if (ytMatch)
      return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`;

    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

    return url;
  } catch {
    return url;
  }
}

// ─── Helper: rebuild active_quiz_pool for a language from all approved quizzes ─
async function rebuildActivePool(language) {
  // Collect all approved questions for this language (or 'all')
  const approved = await db("induction_quizzes")
    .where({ is_approved: true })
    .where(function () {
      this.where({ language }).orWhere({ language: "all" });
    });

  const allQuestions = [];
  for (const row of approved) {
    const qs =
      typeof row.questions === "string"
        ? JSON.parse(row.questions)
        : row.questions;
    allQuestions.push(...qs);
  }

  if (allQuestions.length === 0) {
    // Remove pool entry — no approved questions
    await db("active_quiz_pool").where({ language }).delete();
    return 0;
  }

  // Re-number IDs sequentially
  const numbered = allQuestions.map((q, i) => ({ ...q, id: i + 1 }));

  const existing = await db("active_quiz_pool").where({ language }).first();
  if (existing) {
    await db("active_quiz_pool")
      .where({ language })
      .update({
        questions: JSON.stringify(numbered),
        total: numbered.length,
        updated_at: new Date().toISOString(),
      });
  } else {
    await db("active_quiz_pool").insert({
      language,
      questions: JSON.stringify(numbered),
      total: numbered.length,
      updated_at: new Date().toISOString(),
    });
  }
  return numbered.length;
}

// ─── POST /api/induction/:id/generate-quiz ────────────────────────────────────
router.post("/:id/generate-quiz", authenticateAdmin, async (req, res) => {
  try {
    const { language = "en", count = 5 } = req.body;

    const item = await db("induction_content")
      .where({ id: req.params.id })
      .first();
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: "Content not found" });

    // Need at least one of: description, key_points, or extracted content_text
    const hasContent = item.description || item.key_points || item.content_text;
    if (!hasContent) {
      return res.status(400).json({
        success: false,
        message:
          "This content has no description, key points, or extracted text. " +
          "Edit the content and add Key Safety Points, then try again.",
      });
    }

    // Pass full content item as an array so localGen can read all fields
    const questions = await generateQuizFromContent(
      language,
      [item],
      parseInt(count, 10),
    );

    if (!questions || questions.length === 0) {
      return res.status(503).json({
        success: false,
        message:
          "Could not generate enough questions from this content. " +
          "Add more Key Safety Points (at least 5 bullet points) and try again.",
      });
    }

    res.json({
      success: true,
      questions,
      content_title: item.title,
      content_id: item.id,
      language,
      message: `Generated ${questions.length} questions from "${item.title}". Review and approve them.`,
    });
  } catch (err) {
    console.error("Generate quiz error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/induction/:id/save-quiz ────────────────────────────────────────
// Admin saves (but doesn't yet approve) a set of questions for a content item.
router.post("/:id/save-quiz", authenticateAdmin, async (req, res) => {
  try {
    const { language = "en", questions } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "questions array is required" });
    }

    const item = await db("induction_content")
      .where({ id: req.params.id })
      .first();
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: "Content not found" });

    // Validate question structure
    const valid = questions.every(
      (q) =>
        q.text &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correct === "number" &&
        q.correct >= 0 &&
        q.correct <= 3,
    );
    if (!valid) {
      return res.status(400).json({
        success: false,
        message:
          "Each question must have text, 4 options, and a correct index (0-3)",
      });
    }

    // Upsert — one quiz record per content+language
    const existing = await db("induction_quizzes")
      .where({ induction_content_id: req.params.id, language })
      .first();

    const numbered = questions.map((q, i) => ({ ...q, id: i + 1 }));

    if (existing) {
      await db("induction_quizzes")
        .where({ id: existing.id })
        .update({
          questions: JSON.stringify(numbered),
          question_count: numbered.length,
          is_approved: false, // reset approval on edit
          approved_at: null,
          updated_at: new Date().toISOString(),
        });
    } else {
      await db("induction_quizzes").insert({
        induction_content_id: parseInt(req.params.id, 10),
        language,
        questions: JSON.stringify(numbered),
        question_count: numbered.length,
        is_approved: false,
        generated_by: "local",
        updated_at: new Date().toISOString(),
      });
    }

    await audit(req, {
      action: "induction.quiz_save",
      category: "induction",
      entity_type: "induction_content",
      entity_id: req.params.id,
      details: { language, questions: numbered.length },
    });
    res.json({
      success: true,
      message:
        'Questions saved. Click "Approve" to activate them for visitors.',
    });
  } catch (err) {
    console.error("Save quiz error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/induction/:id/approve-quiz ─────────────────────────────────────
// Admin approves the saved questions — from this point visitors get them.
router.post("/:id/approve-quiz", authenticateAdmin, async (req, res) => {
  try {
    const { language = "en" } = req.body;

    const quiz = await db("induction_quizzes")
      .where({ induction_content_id: req.params.id, language })
      .first();

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message:
          "No saved questions found for this content. Generate and save them first.",
      });
    }

    await db("induction_quizzes").where({ id: quiz.id }).update({
      is_approved: true,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Rebuild the active pool so visitors immediately get the new questions
    const total = await rebuildActivePool(language);

    const item = await db("induction_content")
      .where({ id: req.params.id })
      .first();
    await audit(req, {
      action: "induction.quiz_approve",
      category: "induction",
      entity_type: "induction_content",
      entity_id: req.params.id,
      entity_label: item?.title,
      details: { language, active_pool_total: total },
    });
    res.json({
      success: true,
      message: `✅ Questions approved for "${item?.title}". Visitors will now receive these questions.`,
      active_pool_total: total,
    });
  } catch (err) {
    console.error("Approve quiz error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/induction/:id/quiz ───────────────────────────────────────────
// Admin removes the approved quiz for a content item.
router.delete("/:id/quiz", authenticateAdmin, async (req, res) => {
  try {
    const { language = "en" } = req.query;

    await db("induction_quizzes")
      .where({ induction_content_id: req.params.id, language })
      .delete();

    await rebuildActivePool(language);

    await audit(req, {
      action: "induction.quiz_delete",
      category: "induction",
      entity_type: "induction_content",
      entity_id: req.params.id,
      details: { language },
    });
    res.json({ success: true, message: "Quiz questions removed." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/induction/:id/quiz ──────────────────────────────────────────────
// Get saved quiz questions for a content item (admin view with correct answers).
router.get("/:id/quiz", authenticateAdmin, async (req, res) => {
  try {
    const { language = "en" } = req.query;

    const quiz = await db("induction_quizzes")
      .where({ induction_content_id: req.params.id, language })
      .first();

    if (!quiz) {
      return res.json({ success: true, quiz: null });
    }

    const questions =
      typeof quiz.questions === "string"
        ? JSON.parse(quiz.questions)
        : quiz.questions;

    res.json({ success: true, quiz: { ...quiz, questions } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/induction/active-pool/:language ─────────────────────────────────
// Returns the active quiz pool for a language (used by quiz.js).
router.get("/active-pool/:language", async (req, res) => {
  try {
    const row = await db("active_quiz_pool")
      .where({ language: req.params.language })
      .first();
    if (!row) return res.json({ success: true, questions: [], total: 0 });

    const questions =
      typeof row.questions === "string"
        ? JSON.parse(row.questions)
        : row.questions;

    res.json({ success: true, questions, total: questions.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
