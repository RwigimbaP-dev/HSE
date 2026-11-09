const express = require("express");
const router = express.Router();
const { db } = require("../database/schema");
const { authenticateAdmin, requireRole } = require("../middleware/auth");
const XLSX = require("xlsx");
const { v4: uuidv4 } = require("uuid");
const { audit, diffObjects } = require("../utils/audit");

router.use(authenticateAdmin);

// ─── Helper: legacy logAction → now writes to the audit trail ────────────────
async function logAction(adminId, action, details = null, req = null) {
  const map = { export: "data.export", config_update: "settings.update" };
  await audit(req, {
    action: map[action] || action,
    category: "system",
    details,
  });
}

// ─── GET /api/admin/dashboard ─────────────────────────────────────────────────
router.get("/dashboard", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0]; // 'YYYY-MM-DD'

    const [totalVisitors] = await db("visitors").count("id as count");
    const [visitorsIN] = await db("visits")
      .where({ status: "IN" })
      .count("id as count");
    const [visitorsOUT] = await db("visits")
      .where({ status: "OUT" })
      .count("id as count");
    const [todayVisitors] = await db("visits")
      .whereRaw("check_in_time::date = ?::date", [today])
      .count("id as count");
    const [passedInduction] = await db("visitors")
      .where({ induction_status: "passed" })
      .count("id as count");
    const [failedInduction] = await db("visitors")
      .where({ induction_status: "failed" })
      .count("id as count");
    const [pendingInduction] = await db("visitors")
      .where({ induction_status: "pending" })
      .count("id as count");
    const [totalVisits] = await db("visits").count("id as count");
    const [totalQuizAttempts] = await db("quiz_results").count("id as count");
    const [qrScans] = await db("qr_scans").count("id as count");

    // Last 7 days visitor trend — PostgreSQL date casting
    const trend = await db("visits")
      .select(
        db.raw("check_in_time::date AS date"),
        db.raw("COUNT(*) AS count"),
      )
      .whereRaw("check_in_time::date >= (NOW() - INTERVAL '6 days')::date")
      .groupByRaw("check_in_time::date")
      .orderBy("date", "asc");

    // Recent 10 visitors with their latest visit
    const recentVisitors = await db("visitors as v")
      .leftJoin(
        db("visits")
          .select("*")
          .whereRaw("id IN (SELECT MAX(id) FROM visits GROUP BY visitor_id)")
          .as("vi"),
        "vi.visitor_id",
        "v.id",
      )
      .select(
        "v.first_name",
        "v.last_name",
        "v.phone",
        "v.company",
        "v.host_name",
        "v.induction_status",
        "v.quiz_score",
        "vi.status as visit_status",
        "vi.check_in_time",
      )
      .orderBy("v.created_at", "desc")
      .limit(10);

    res.json({
      success: true,
      stats: {
        totalVisitors: Number(totalVisitors.count),
        visitorsIN: Number(visitorsIN.count),
        visitorsOUT: Number(visitorsOUT.count),
        todayVisitors: Number(todayVisitors.count),
        passedInduction: Number(passedInduction.count),
        failedInduction: Number(failedInduction.count),
        pendingInduction: Number(pendingInduction.count),
        totalVisits: Number(totalVisits.count),
        totalQuizAttempts: Number(totalQuizAttempts.count),
        qrScans: Number(qrScans.count),
      },
      trend: trend.map((r) => ({ date: r.date, count: Number(r.count) })),
      recentVisitors,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/visitors ──────────────────────────────────────────────────
router.get("/visitors", async (req, res) => {
  try {
    const { search, status, induction_status, date_from, date_to, host_name } =
      req.query;

    let query = db("visitors as v")
      .leftJoin(
        db.raw(`(
          SELECT DISTINCT ON (visitor_id) *
          FROM visits
          ORDER BY visitor_id, id DESC
        ) AS vi`),
        "vi.visitor_id",
        "v.id",
      )
      .select(
        "v.*",
        "vi.status as visit_status",
        "vi.check_in_time",
        "vi.check_out_time",
        "vi.notes as visit_notes",
        "vi.id as visit_id",
      )
      .orderBy("v.created_at", "desc");

    if (search) {
      query = query.where(function () {
        this.where("v.first_name", "ilike", `%${search}%`) // ilike = case-insensitive in PG
          .orWhere("v.last_name", "ilike", `%${search}%`)
          .orWhere("v.phone", "ilike", `%${search}%`)
          .orWhere("v.company", "ilike", `%${search}%`)
          .orWhere("v.email", "ilike", `%${search}%`);
      });
    }
    if (status) query = query.where("vi.status", status);
    if (induction_status)
      query = query.where("v.induction_status", induction_status);
    if (date_from)
      query = query.whereRaw("vi.check_in_time::date >= ?::date", [date_from]);
    if (date_to)
      query = query.whereRaw("vi.check_in_time::date <= ?::date", [date_to]);
    if (host_name)
      query = query.where("v.host_name", "ilike", `%${host_name}%`);

    const visitors = await query;
    res.json({ success: true, visitors, total: visitors.length });
  } catch (err) {
    console.error("Visitors query error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  VISITOR CRUD (admin)  — edit & delete REQUIRE a written reason
// ═════════════════════════════════════════════════════════════════════════════
const PURPOSES = [
  "meeting",
  "delivery",
  "maintenance",
  "interview",
  "training",
  "audit",
  "other",
];
const ID_TYPES = ["national_id", "passport", "drivers_license", "company_id"];
const INDUCTION = ["pending", "passed", "failed"];
const LANGS = ["en", "fr", "rw"];
const EDITABLE = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "company",
  "host_name",
  "host_department",
  "purpose",
  "id_type",
  "id_number",
  "language",
  "induction_status",
];

function getReason(req, res) {
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 5) {
    res
      .status(400)
      .json({
        success: false,
        code: "REASON_REQUIRED",
        message: "A reason (at least 5 characters) is required.",
      });
    return null;
  }
  return reason.slice(0, 1000);
}

// Validates + cleans visitor fields. `requireAll` = true when creating.
function cleanVisitorInput(body, requireAll) {
  const data = {};
  for (const f of EDITABLE) {
    if (body[f] === undefined) continue;
    data[f] = typeof body[f] === "string" ? body[f].trim() : body[f];
  }

  const must = [
    "first_name",
    "last_name",
    "phone",
    "company",
    "host_name",
    "id_number",
  ];
  for (const f of must) {
    if ((requireAll || f in data) && !String(data[f] ?? "").trim())
      return { error: `${f.replace("_", " ")} is required` };
  }
  if (data.phone !== undefined) {
    if (!/^\+?[\d\s\-]{7,15}$/.test(data.phone))
      return { error: "Invalid phone number" };
    data.phone = data.phone.replace(/\s+/g, "");
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    return { error: "Invalid email address" };
  if (data.purpose !== undefined && !PURPOSES.includes(data.purpose))
    return { error: "Invalid purpose" };
  if (data.id_type !== undefined && !ID_TYPES.includes(data.id_type))
    return { error: "Invalid ID type" };
  if (
    data.induction_status !== undefined &&
    !INDUCTION.includes(data.induction_status)
  )
    return { error: "Invalid induction status" };
  if (data.language !== undefined && !LANGS.includes(data.language))
    return { error: "Invalid language" };
  for (const f of [
    "first_name",
    "last_name",
    "company",
    "host_name",
    "host_department",
    "id_number",
    "email",
  ]) {
    if (data[f] && data[f].length > 150)
      return { error: `${f.replace("_", " ")} is too long` };
  }
  return { data };
}

async function phoneTaken(phone, exceptId = null) {
  const digits = phone.replace(/\D/g, "");
  let q = db("visitors").whereRaw("regexp_replace(phone, '\\D', '', 'g') = ?", [
    digits,
  ]);
  if (exceptId) q = q.whereNot({ id: exceptId });
  return !!(await q.first());
}

const visitorLabel = (v) => `${v.first_name} ${v.last_name} (${v.phone})`;

// POST /api/admin/visitors — create
router.post("/visitors", async (req, res) => {
  try {
    const { data, error } = cleanVisitorInput(req.body, true);
    if (error) return res.status(400).json({ success: false, message: error });
    if (await phoneTaken(data.phone)) {
      return res
        .status(409)
        .json({
          success: false,
          message: "A visitor with this phone number already exists.",
        });
    }

    const [row] = await db("visitors")
      .insert({
        uuid: uuidv4(),
        email: "",
        host_department: "",
        language: "en",
        purpose: "meeting",
        id_type: "national_id",
        induction_status: "pending",
        ...data,
      })
      .returning("id");
    const visitor = await db("visitors")
      .where({ id: row?.id ?? row })
      .first();

    await audit(req, {
      action: "visitor.create",
      category: "visitor",
      entity_type: "visitor",
      entity_id: visitor.id,
      entity_label: visitorLabel(visitor),
      after: data,
    });
    res.json({ success: true, visitor });
  } catch (err) {
    console.error("Create visitor error:", err);
    res
      .status(500)
      .json({ success: false, message: "Could not create visitor" });
  }
});

// PUT /api/admin/visitors/:id — edit (reason required)
router.put("/visitors/:id", async (req, res) => {
  try {
    const reason = getReason(req, res);
    if (!reason) return;

    const existing = await db("visitors").where({ id: req.params.id }).first();
    if (!existing)
      return res
        .status(404)
        .json({ success: false, message: "Visitor not found" });

    const { data, error } = cleanVisitorInput(req.body, false);
    if (error) return res.status(400).json({ success: false, message: error });

    if (data.phone && (await phoneTaken(data.phone, existing.id))) {
      return res
        .status(409)
        .json({
          success: false,
          message: "Another visitor already uses this phone number.",
        });
    }

    const { before, after, changed } = diffObjects(
      existing,
      data,
      Object.keys(data),
    );
    if (changed.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Nothing was changed." });
    }

    await db("visitors").where({ id: existing.id }).update(after);
    const visitor = await db("visitors").where({ id: existing.id }).first();

    await audit(req, {
      action: "visitor.update",
      category: "visitor",
      entity_type: "visitor",
      entity_id: existing.id,
      entity_label: visitorLabel(visitor),
      reason,
      before,
      after,
      details: { fields_changed: changed },
    });
    res.json({ success: true, visitor });
  } catch (err) {
    console.error("Update visitor error:", err);
    res
      .status(500)
      .json({ success: false, message: "Could not update visitor" });
  }
});

// DELETE /api/admin/visitors/:id — delete (reason required)
router.delete("/visitors/:id", async (req, res) => {
  try {
    const reason = getReason(req, res);
    if (!reason) return;

    const existing = await db("visitors").where({ id: req.params.id }).first();
    if (!existing)
      return res
        .status(404)
        .json({ success: false, message: "Visitor not found" });

    const [{ count: visits }] = await db("visits")
      .where({ visitor_id: existing.id })
      .count("id as count");
    const [{ count: quizzes }] = await db("quiz_results")
      .where({ visitor_id: existing.id })
      .count("id as count");

    // Snapshot is kept in the audit trail so the record can be reconstructed if needed
    await audit(req, {
      action: "visitor.delete",
      category: "visitor",
      entity_type: "visitor",
      entity_id: existing.id,
      entity_label: visitorLabel(existing),
      reason,
      before: existing,
      details: {
        visits_deleted: Number(visits),
        quiz_attempts_deleted: Number(quizzes),
      },
    });

    await db("visitors").where({ id: existing.id }).delete(); // visits / quiz rows cascade
    res.json({ success: true, message: "Visitor deleted" });
  } catch (err) {
    console.error("Delete visitor error:", err);
    res
      .status(500)
      .json({ success: false, message: "Could not delete visitor" });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  AUDIT TRAIL (read-only)
// ═════════════════════════════════════════════════════════════════════════════
function auditQuery(q) {
  const { search, category, actor_type, action, date_from, date_to } = q;
  let query = db("audit_logs");
  if (category) query = query.where("category", category);
  if (actor_type) query = query.where("actor_type", actor_type);
  if (action) query = query.where("action", action);
  if (date_from)
    query = query.whereRaw("created_at::date >= ?::date", [date_from]);
  if (date_to) query = query.whereRaw("created_at::date <= ?::date", [date_to]);
  if (search) {
    const like = `%${search}%`;
    query = query.where(function () {
      this.where("actor_name", "ilike", like)
        .orWhere("action", "ilike", like)
        .orWhere("entity_label", "ilike", like)
        .orWhere("reason", "ilike", like)
        .orWhere("ip_address", "ilike", like)
        .orWhere("details", "ilike", like);
    });
  }
  return query;
}

const parseJson = (v) => {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

// GET /api/admin/audit
router.get("/audit", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(5, parseInt(req.query.limit, 10) || 25),
    );

    const [{ count }] = await auditQuery(req.query).count("id as count");
    const rows = await auditQuery(req.query)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit)
      .offset((page - 1) * limit);

    const logs = rows.map((r) => ({
      ...r,
      before_data: parseJson(r.before_data),
      after_data: parseJson(r.after_data),
      details: parseJson(r.details),
    }));
    const total = Number(count);
    res.json({
      success: true,
      logs,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error("Audit list error:", err);
    res
      .status(500)
      .json({ success: false, message: "Could not load the audit log" });
  }
});

// GET /api/admin/audit/export — Excel
router.get("/audit/export", async (req, res) => {
  try {
    const rows = await auditQuery(req.query)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(10000);
    const sheet = rows.map((r) => ({
      Time: r.created_at
        ? new Date(r.created_at).toISOString().replace("T", " ").slice(0, 19)
        : "",
      Who: r.actor_name || "",
      Type: r.actor_type,
      Action: r.action,
      Category: r.category,
      Target: r.entity_label || "",
      Reason: r.reason || "",
      Before: r.before_data || "",
      After: r.after_data || "",
      Details: r.details || "",
      "IP address": r.ip_address || "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sheet),
      "Audit Log",
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    await audit(req, {
      action: "data.export",
      category: "system",
      details: { what: "audit_log", rows: rows.length },
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );
    res.send(buf);
  } catch (err) {
    console.error("Audit export error:", err);
    res.status(500).json({ success: false, message: "Export failed" });
  }
});

// ─── GET /api/admin/visitor/:id — single visitor full detail ─────────────────
router.get("/visitor/:id", async (req, res) => {
  try {
    const visitor = await db("visitors").where({ id: req.params.id }).first();
    if (!visitor)
      return res
        .status(404)
        .json({ success: false, message: "Visitor not found" });

    const visits = await db("visits")
      .where({ visitor_id: req.params.id })
      .orderBy("check_in_time", "desc");

    const quizResults = await db("quiz_results")
      .where({ visitor_id: req.params.id })
      .orderBy("attempt_number", "asc");

    const quizHistory = await Promise.all(
      quizResults.map(async (result) => {
        const answers = await db("quiz_answers")
          .where({ quiz_result_id: result.id })
          .orderBy("question_id", "asc");
        return { ...result, answers };
      }),
    );

    res.json({ success: true, visitor, visits, quizHistory });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/export — full Excel export (superadmin or admin only) ────
router.get("/export", requireRole("superadmin", "admin"), async (req, res) => {
  try {
    const visitors = await db("visitors as v")
      .leftJoin(
        db.raw(`(
          SELECT DISTINCT ON (visitor_id) *
          FROM visits
          ORDER BY visitor_id, id DESC
        ) AS vi`),
        "vi.visitor_id",
        "v.id",
      )
      .select(
        "v.id",
        "v.uuid",
        db.raw("v.first_name || ' ' || v.last_name AS full_name"),
        "v.phone",
        "v.email",
        "v.company",
        "v.host_name",
        "v.host_department",
        "v.purpose",
        "v.id_type",
        "v.id_number",
        "v.language",
        "v.induction_status",
        db.raw("v.quiz_score::text || '%' AS quiz_score"),
        "v.quiz_attempts",
        "vi.status as visit_status",
        "vi.check_in_time",
        "vi.check_out_time",
        "vi.notes as visit_notes",
        "v.created_at as registration_date",
      )
      .orderBy("v.created_at", "desc");

    const worksheetData = visitors.map((v) => ({
      ID: v.id,
      UUID: v.uuid,
      "Full Name": v.full_name,
      Phone: v.phone,
      Email: v.email || "",
      "Company/Organization": v.company,
      "Person Visited": v.host_name,
      Department: v.host_department || "",
      "Purpose of Visit": v.purpose,
      "ID Type": v.id_type,
      "ID Number": v.id_number,
      Language: v.language,
      "Induction Status": v.induction_status,
      "Quiz Score": v.quiz_score,
      "Quiz Attempts": v.quiz_attempts,
      "Visit Status": v.visit_status || "N/A",
      "Check-In Time": v.check_in_time || "",
      "Check-Out Time": v.check_out_time || "",
      "Visit Notes": v.visit_notes || "",
      "Registration Date": v.registration_date,
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    worksheet["!cols"] = [
      { wch: 5 },
      { wch: 38 },
      { wch: 25 },
      { wch: 15 },
      { wch: 25 },
      { wch: 25 },
      { wch: 20 },
      { wch: 20 },
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      { wch: 20 },
      { wch: 30 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, "Visitor Records");

    // Sheet 2 — full per-question quiz answers
    const quizAnswers = await db("quiz_answers as qa")
      .join("visitors as v", "qa.visitor_id", "v.id")
      .select(
        db.raw("v.first_name || ' ' || v.last_name AS visitor_name"),
        "v.phone",
        "v.company",
        "qa.attempt_number",
        "qa.language",
        "qa.question_id",
        "qa.question_text",
        "qa.selected_text",
        "qa.correct_text",
        db.raw(
          "CASE WHEN qa.is_correct = 1 THEN 'Correct' ELSE 'Incorrect' END AS result",
        ),
        "qa.created_at",
      )
      .orderBy(["v.id", "qa.attempt_number", "qa.question_id"]);

    if (quizAnswers.length > 0) {
      const qaSheet = XLSX.utils.json_to_sheet(
        quizAnswers.map((a) => ({
          "Visitor Name": a.visitor_name,
          Phone: a.phone,
          Company: a.company,
          "Attempt #": a.attempt_number,
          Language: a.language,
          "Question #": a.question_id,
          Question: a.question_text,
          "Visitor Answer": a.selected_text,
          "Correct Answer": a.correct_text,
          Result: a.result,
          Date: a.created_at,
        })),
      );
      qaSheet["!cols"] = [
        { wch: 25 },
        { wch: 15 },
        { wch: 20 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 50 },
        { wch: 30 },
        { wch: 30 },
        { wch: 12 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(workbook, qaSheet, "Quiz Answers");
    }

    // Sheet 3 — summary stats
    const today = new Date().toISOString().split("T")[0];
    const [tv] = await db("visitors").count("id as c");
    const [vi] = await db("visits").where({ status: "IN" }).count("id as c");
    const [vo] = await db("visits").where({ status: "OUT" }).count("id as c");
    const [vp] = await db("visitors")
      .where({ induction_status: "passed" })
      .count("id as c");
    const [vf] = await db("visitors")
      .where({ induction_status: "failed" })
      .count("id as c");
    const [td] = await db("visits")
      .whereRaw("check_in_time::date = ?::date", [today])
      .count("id as c");
    const [qa] = await db("quiz_results").count("id as c");

    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: "Total Registered Visitors", Value: Number(tv.c) },
      { Metric: "Visitors Currently IN", Value: Number(vi.c) },
      { Metric: "Visitors Checked OUT", Value: Number(vo.c) },
      { Metric: "Today's Visitors", Value: Number(td.c) },
      { Metric: "Passed HSE Induction", Value: Number(vp.c) },
      { Metric: "Failed HSE Induction", Value: Number(vf.c) },
      { Metric: "Total Quiz Attempts", Value: Number(qa.c) },
      { Metric: "Export Date", Value: new Date().toLocaleString() },
    ]);
    summarySheet["!cols"] = [{ wch: 32 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    await logAction(req.admin.id, "export", { rows: visitors.length }, req);

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="visitor-records-${today}.xlsx"`,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buffer);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/reports/daily ─────────────────────────────────────────────
router.get("/reports/daily", async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split("T")[0];

    const dailyVisits = await db("visits as vi")
      .join("visitors as v", "vi.visitor_id", "v.id")
      .whereRaw("vi.check_in_time::date = ?::date", [targetDate])
      .select(
        db.raw("v.first_name || ' ' || v.last_name AS full_name"),
        "v.phone",
        "v.company",
        "v.host_name",
        "v.purpose",
        "v.induction_status",
        "v.quiz_score",
        "v.quiz_attempts",
        "vi.status",
        "vi.check_in_time",
        "vi.check_out_time",
        "vi.notes",
      )
      .orderBy("vi.check_in_time", "asc");

    const summary = {
      date: targetDate,
      total: dailyVisits.length,
      in: dailyVisits.filter((v) => v.status === "IN").length,
      out: dailyVisits.filter((v) => v.status === "OUT").length,
      passed: dailyVisits.filter((v) => v.induction_status === "passed").length,
      failed: dailyVisits.filter((v) => v.induction_status === "failed").length,
    };

    res.json({ success: true, date: targetDate, visits: dailyVisits, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/config ────────────────────────────────────────────────────
router.get("/config", async (req, res) => {
  try {
    const rows = await db("system_config").orderBy("key");
    const config = {};
    rows.forEach((r) => {
      config[r.key] = r.value;
    });
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/admin/config/:key — superadmin only ────────────────────────────
router.put("/config/:key", requireRole("superadmin"), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined || value === null) {
      return res
        .status(400)
        .json({ success: false, message: "value is required" });
    }

    const exists = await db("system_config").where({ key }).first();
    if (!exists) {
      return res
        .status(404)
        .json({ success: false, message: `Config key '${key}' not found` });
    }

    await db("system_config")
      .where({ key })
      .update({ value: String(value), updated_at: new Date().toISOString() });

    await logAction(req.admin.id, "config_update", { key, value }, req);

    const updated = await db("system_config").where({ key }).first();
    res.json({ success: true, config: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/logs ──────────────────────────────────────────────────────
router.get("/logs", async (req, res) => {
  try {
    const logs = await db("admin_logs as al")
      .leftJoin("admins as a", "al.admin_id", "a.id")
      .select("al.*", "a.username", "a.full_name")
      .orderBy("al.created_at", "desc")
      .limit(200);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/quiz-stats ────────────────────────────────────────────────
router.get("/quiz-stats", async (req, res) => {
  try {
    const [passed] = await db("quiz_results")
      .where({ passed: 1 })
      .count("id as c");
    const [failed] = await db("quiz_results")
      .where({ passed: 0 })
      .count("id as c");
    const [avgRow] = await db("quiz_results").avg("score as avg_score");

    const hardestQuestions = await db("quiz_answers")
      .select("question_id", "question_text")
      .where({ is_correct: 0 })
      .count("id as fail_count")
      .groupBy("question_id", "question_text")
      .orderBy("fail_count", "desc")
      .limit(5);

    const attemptsBreakdown = await db("quiz_results")
      .select("attempt_number")
      .count("id as count")
      .groupBy("attempt_number")
      .orderBy("attempt_number");

    const p = Number(passed.c);
    const f = Number(failed.c);

    res.json({
      success: true,
      stats: {
        totalAttempts: p + f,
        passed: p,
        failed: f,
        passRate: p + f > 0 ? Math.round((p / (p + f)) * 100) : 0,
        avgScore: Math.round(Number(avgRow.avg_score) || 0),
      },
      hardestQuestions,
      attemptsBreakdown,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
