const express = require('express');
const router = express.Router();
const { db } = require('../database/schema');
const { authenticateAdmin, requireRole } = require('../middleware/auth');
const XLSX = require('xlsx');

router.use(authenticateAdmin);

// ─── Helper: write to admin_logs ─────────────────────────────────────────────
async function logAction(adminId, action, details = null, req = null) {
  try {
    await db('admin_logs').insert({
      admin_id:   adminId,
      action,
      details:    details ? JSON.stringify(details) : null,
      ip_address: req ? (req.ip || req.connection?.remoteAddress || null) : null,
    });
  } catch (e) {
    console.warn('admin_logs insert failed:', e.message);
  }
}

// ─── GET /api/admin/dashboard ─────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

    const [totalVisitors]     = await db('visitors').count('id as count');
    const [visitorsIN]        = await db('visits').where({ status: 'IN' }).count('id as count');
    const [visitorsOUT]       = await db('visits').where({ status: 'OUT' }).count('id as count');
    const [todayVisitors]     = await db('visits')
      .whereRaw('check_in_time::date = ?::date', [today])
      .count('id as count');
    const [passedInduction]   = await db('visitors').where({ induction_status: 'passed' }).count('id as count');
    const [failedInduction]   = await db('visitors').where({ induction_status: 'failed' }).count('id as count');
    const [pendingInduction]  = await db('visitors').where({ induction_status: 'pending' }).count('id as count');
    const [totalVisits]       = await db('visits').count('id as count');
    const [totalQuizAttempts] = await db('quiz_results').count('id as count');
    const [qrScans]           = await db('qr_scans').count('id as count');

    // Last 7 days visitor trend — PostgreSQL date casting
    const trend = await db('visits')
      .select(
        db.raw('check_in_time::date AS date'),
        db.raw('COUNT(*) AS count')
      )
      .whereRaw("check_in_time::date >= (NOW() - INTERVAL '6 days')::date")
      .groupByRaw('check_in_time::date')
      .orderBy('date', 'asc');

    // Recent 10 visitors with their latest visit
    const recentVisitors = await db('visitors as v')
      .leftJoin(
        db('visits').select('*')
          .whereRaw('id IN (SELECT MAX(id) FROM visits GROUP BY visitor_id)')
          .as('vi'),
        'vi.visitor_id', 'v.id'
      )
      .select(
        'v.first_name', 'v.last_name', 'v.phone', 'v.company',
        'v.host_name', 'v.induction_status', 'v.quiz_score',
        'vi.status as visit_status', 'vi.check_in_time'
      )
      .orderBy('v.created_at', 'desc')
      .limit(10);

    res.json({
      success: true,
      stats: {
        totalVisitors:     Number(totalVisitors.count),
        visitorsIN:        Number(visitorsIN.count),
        visitorsOUT:       Number(visitorsOUT.count),
        todayVisitors:     Number(todayVisitors.count),
        passedInduction:   Number(passedInduction.count),
        failedInduction:   Number(failedInduction.count),
        pendingInduction:  Number(pendingInduction.count),
        totalVisits:       Number(totalVisits.count),
        totalQuizAttempts: Number(totalQuizAttempts.count),
        qrScans:           Number(qrScans.count),
      },
      trend: trend.map((r) => ({ date: r.date, count: Number(r.count) })),
      recentVisitors,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/visitors ──────────────────────────────────────────────────
router.get('/visitors', async (req, res) => {
  try {
    const { search, status, induction_status, date_from, date_to, host_name } = req.query;

    let query = db('visitors as v')
      .leftJoin(
        db.raw(`(
          SELECT DISTINCT ON (visitor_id) *
          FROM visits
          ORDER BY visitor_id, id DESC
        ) AS vi`),
        'vi.visitor_id', 'v.id'
      )
      .select(
        'v.*',
        'vi.status as visit_status',
        'vi.check_in_time',
        'vi.check_out_time',
        'vi.notes as visit_notes',
        'vi.id as visit_id'
      )
      .orderBy('v.created_at', 'desc');

    if (search) {
      query = query.where(function () {
        this.where('v.first_name', 'ilike', `%${search}%`)   // ilike = case-insensitive in PG
          .orWhere('v.last_name',  'ilike', `%${search}%`)
          .orWhere('v.phone',      'ilike', `%${search}%`)
          .orWhere('v.company',    'ilike', `%${search}%`)
          .orWhere('v.email',      'ilike', `%${search}%`);
      });
    }
    if (status)           query = query.where('vi.status', status);
    if (induction_status) query = query.where('v.induction_status', induction_status);
    if (date_from)        query = query.whereRaw('vi.check_in_time::date >= ?::date', [date_from]);
    if (date_to)          query = query.whereRaw('vi.check_in_time::date <= ?::date', [date_to]);
    if (host_name)        query = query.where('v.host_name', 'ilike', `%${host_name}%`);

    const visitors = await query;
    res.json({ success: true, visitors, total: visitors.length });
  } catch (err) {
    console.error('Visitors query error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/visitor/:id — single visitor full detail ─────────────────
router.get('/visitor/:id', async (req, res) => {
  try {
    const visitor = await db('visitors').where({ id: req.params.id }).first();
    if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });

    const visits = await db('visits')
      .where({ visitor_id: req.params.id })
      .orderBy('check_in_time', 'desc');

    const quizResults = await db('quiz_results')
      .where({ visitor_id: req.params.id })
      .orderBy('attempt_number', 'asc');

    const quizHistory = await Promise.all(quizResults.map(async (result) => {
      const answers = await db('quiz_answers')
        .where({ quiz_result_id: result.id })
        .orderBy('question_id', 'asc');
      return { ...result, answers };
    }));

    res.json({ success: true, visitor, visits, quizHistory });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/export — full Excel export (superadmin or admin only) ────
router.get('/export', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const visitors = await db('visitors as v')
      .leftJoin(
        db.raw(`(
          SELECT DISTINCT ON (visitor_id) *
          FROM visits
          ORDER BY visitor_id, id DESC
        ) AS vi`),
        'vi.visitor_id', 'v.id'
      )
      .select(
        'v.id', 'v.uuid',
        db.raw("v.first_name || ' ' || v.last_name AS full_name"),
        'v.phone', 'v.email', 'v.company',
        'v.host_name', 'v.host_department', 'v.purpose',
        'v.id_type', 'v.id_number', 'v.language',
        'v.induction_status',
        db.raw("v.quiz_score::text || '%' AS quiz_score"),
        'v.quiz_attempts',
        'vi.status as visit_status',
        'vi.check_in_time', 'vi.check_out_time',
        'vi.notes as visit_notes',
        'v.created_at as registration_date'
      )
      .orderBy('v.created_at', 'desc');

    const worksheetData = visitors.map((v) => ({
      'ID':                   v.id,
      'UUID':                 v.uuid,
      'Full Name':            v.full_name,
      'Phone':                v.phone,
      'Email':                v.email || '',
      'Company/Organization': v.company,
      'Person Visited':       v.host_name,
      'Department':           v.host_department || '',
      'Purpose of Visit':     v.purpose,
      'ID Type':              v.id_type,
      'ID Number':            v.id_number,
      'Language':             v.language,
      'Induction Status':     v.induction_status,
      'Quiz Score':           v.quiz_score,
      'Quiz Attempts':        v.quiz_attempts,
      'Visit Status':         v.visit_status || 'N/A',
      'Check-In Time':        v.check_in_time  || '',
      'Check-Out Time':       v.check_out_time || '',
      'Visit Notes':          v.visit_notes    || '',
      'Registration Date':    v.registration_date,
    }));

    const workbook  = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    worksheet['!cols'] = [
      { wch: 5 },  { wch: 38 }, { wch: 25 }, { wch: 15 }, { wch: 25 },
      { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 15 },
      { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Visitor Records');

    // Sheet 2 — full per-question quiz answers
    const quizAnswers = await db('quiz_answers as qa')
      .join('visitors as v', 'qa.visitor_id', 'v.id')
      .select(
        db.raw("v.first_name || ' ' || v.last_name AS visitor_name"),
        'v.phone', 'v.company',
        'qa.attempt_number', 'qa.language',
        'qa.question_id', 'qa.question_text',
        'qa.selected_text', 'qa.correct_text',
        db.raw("CASE WHEN qa.is_correct = 1 THEN 'Correct' ELSE 'Incorrect' END AS result"),
        'qa.created_at'
      )
      .orderBy(['v.id', 'qa.attempt_number', 'qa.question_id']);

    if (quizAnswers.length > 0) {
      const qaSheet = XLSX.utils.json_to_sheet(quizAnswers.map((a) => ({
        'Visitor Name':   a.visitor_name,
        'Phone':          a.phone,
        'Company':        a.company,
        'Attempt #':      a.attempt_number,
        'Language':       a.language,
        'Question #':     a.question_id,
        'Question':       a.question_text,
        'Visitor Answer': a.selected_text,
        'Correct Answer': a.correct_text,
        'Result':         a.result,
        'Date':           a.created_at,
      })));
      qaSheet['!cols'] = [
        { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
        { wch: 10 }, { wch: 50 }, { wch: 30 }, { wch: 30 }, { wch: 12 }, { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(workbook, qaSheet, 'Quiz Answers');
    }

    // Sheet 3 — summary stats
    const today = new Date().toISOString().split('T')[0];
    const [tv] = await db('visitors').count('id as c');
    const [vi] = await db('visits').where({ status: 'IN' }).count('id as c');
    const [vo] = await db('visits').where({ status: 'OUT' }).count('id as c');
    const [vp] = await db('visitors').where({ induction_status: 'passed' }).count('id as c');
    const [vf] = await db('visitors').where({ induction_status: 'failed' }).count('id as c');
    const [td] = await db('visits').whereRaw('check_in_time::date = ?::date', [today]).count('id as c');
    const [qa] = await db('quiz_results').count('id as c');

    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: 'Total Registered Visitors', Value: Number(tv.c) },
      { Metric: 'Visitors Currently IN',     Value: Number(vi.c) },
      { Metric: 'Visitors Checked OUT',      Value: Number(vo.c) },
      { Metric: "Today's Visitors",          Value: Number(td.c) },
      { Metric: 'Passed HSE Induction',      Value: Number(vp.c) },
      { Metric: 'Failed HSE Induction',      Value: Number(vf.c) },
      { Metric: 'Total Quiz Attempts',       Value: Number(qa.c) },
      { Metric: 'Export Date',               Value: new Date().toLocaleString() },
    ]);
    summarySheet['!cols'] = [{ wch: 32 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    await logAction(req.admin.id, 'export', { rows: visitors.length }, req);

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="visitor-records-${today}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/reports/daily ─────────────────────────────────────────────
router.get('/reports/daily', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const dailyVisits = await db('visits as vi')
      .join('visitors as v', 'vi.visitor_id', 'v.id')
      .whereRaw('vi.check_in_time::date = ?::date', [targetDate])
      .select(
        db.raw("v.first_name || ' ' || v.last_name AS full_name"),
        'v.phone', 'v.company', 'v.host_name', 'v.purpose',
        'v.induction_status', 'v.quiz_score', 'v.quiz_attempts',
        'vi.status', 'vi.check_in_time', 'vi.check_out_time', 'vi.notes'
      )
      .orderBy('vi.check_in_time', 'asc');

    const summary = {
      date:   targetDate,
      total:  dailyVisits.length,
      in:     dailyVisits.filter((v) => v.status === 'IN').length,
      out:    dailyVisits.filter((v) => v.status === 'OUT').length,
      passed: dailyVisits.filter((v) => v.induction_status === 'passed').length,
      failed: dailyVisits.filter((v) => v.induction_status === 'failed').length,
    };

    res.json({ success: true, date: targetDate, visits: dailyVisits, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/config ────────────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    const rows = await db('system_config').orderBy('key');
    const config = {};
    rows.forEach((r) => { config[r.key] = r.value; });
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/admin/config/:key — superadmin only ────────────────────────────
router.put('/config/:key', requireRole('superadmin'), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined || value === null) {
      return res.status(400).json({ success: false, message: 'value is required' });
    }

    const exists = await db('system_config').where({ key }).first();
    if (!exists) {
      return res.status(404).json({ success: false, message: `Config key '${key}' not found` });
    }

    await db('system_config')
      .where({ key })
      .update({ value: String(value), updated_at: new Date().toISOString() });

    await logAction(req.admin.id, 'config_update', { key, value }, req);

    const updated = await db('system_config').where({ key }).first();
    res.json({ success: true, config: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/logs ──────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const logs = await db('admin_logs as al')
      .leftJoin('admins as a', 'al.admin_id', 'a.id')
      .select('al.*', 'a.username', 'a.full_name')
      .orderBy('al.created_at', 'desc')
      .limit(200);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/admin/quiz-stats ────────────────────────────────────────────────
router.get('/quiz-stats', async (req, res) => {
  try {
    const [passed]  = await db('quiz_results').where({ passed: 1 }).count('id as c');
    const [failed]  = await db('quiz_results').where({ passed: 0 }).count('id as c');
    const [avgRow]  = await db('quiz_results').avg('score as avg_score');

    const hardestQuestions = await db('quiz_answers')
      .select('question_id', 'question_text')
      .where({ is_correct: 0 })
      .count('id as fail_count')
      .groupBy('question_id', 'question_text')
      .orderBy('fail_count', 'desc')
      .limit(5);

    const attemptsBreakdown = await db('quiz_results')
      .select('attempt_number')
      .count('id as count')
      .groupBy('attempt_number')
      .orderBy('attempt_number');

    const p = Number(passed.c);
    const f = Number(failed.c);

    res.json({
      success: true,
      stats: {
        totalAttempts: p + f,
        passed:        p,
        failed:        f,
        passRate:      p + f > 0 ? Math.round((p / (p + f)) * 100) : 0,
        avgScore:      Math.round(Number(avgRow.avg_score) || 0),
      },
      hardestQuestions,
      attemptsBreakdown,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
