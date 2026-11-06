const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db }   = require('../database/schema');
const { authenticateVisitor, issueVisitorToken } = require('../middleware/auth');
const { validate, registerRules } = require('../middleware/validate');

// ─── Helper: verify the token's visitor_id matches the request body ───────────
function assertOwnership(req, res, visitor_id) {
  const claimed = parseInt(visitor_id, 10);
  if (req.visitorSession.visitor_id !== claimed) {
    res.status(403).json({ success: false, message: 'Token does not match this visitor' });
    return false;
  }
  return true;
}

// ─── POST /api/visitors/register (public) ─────────────────────────────────────
router.post('/register', validate(registerRules), async (req, res) => {
  try {
    const {
      first_name, last_name, email, phone, company,
      host_name, host_department, purpose,
      id_type, id_number, language,
    } = req.body;

    // Normalize phone — strip extra spaces
    const cleanPhone = phone.trim().replace(/\s+/g, '');

    // Prevent duplicate active check-in
    const activeVisit = await db('visits')
      .join('visitors', 'visits.visitor_id', 'visitors.id')
      .where('visitors.phone', cleanPhone)
      .where('visits.status', 'IN')
      .first();

    if (activeVisit) {
      return res.status(409).json({
        success: false,
        message: 'A visitor with this phone number is already checked in',
        code:    'ALREADY_CHECKED_IN',
      });
    }

    const existingVisitor = await db('visitors').where({ phone: cleanPhone }).first();
    let visitorId, visitorUuid;

    if (existingVisitor) {
      await db('visitors').where({ phone: cleanPhone }).update({
        first_name: first_name.trim(),
        last_name:  last_name.trim(),
        email:      email?.trim() || '',
        company:    company.trim(),
        host_name:  host_name.trim(),
        host_department: host_department?.trim() || '',
        purpose,
        id_type,
        id_number:  id_number.trim(),
        language:   language || 'en',
        induction_status: 'pending',
        quiz_score:  0,
        quiz_attempts: 0,
        created_at:  new Date().toISOString(),
      });
      visitorId   = existingVisitor.id;
      visitorUuid = existingVisitor.uuid;
    } else {
      visitorUuid = uuidv4();
      const [row] = await db('visitors').insert({
        uuid:       visitorUuid,
        first_name: first_name.trim(),
        last_name:  last_name.trim(),
        email:      email?.trim() || '',
        phone:      cleanPhone,
        company:    company.trim(),
        host_name:  host_name.trim(),
        host_department: host_department?.trim() || '',
        purpose,
        id_type,
        id_number:  id_number.trim(),
        language:   language || 'en',
        induction_status: 'pending',
      }).returning('id');
      visitorId = row?.id ?? row;
    }

    const visitor = await db('visitors').where({ id: visitorId }).first();

    // Issue a short-lived visitor session token
    const visitorToken = issueVisitorToken(visitorId, cleanPhone);

    res.json({ success: true, visitor, visitorToken });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// ─── GET /api/visitors/phone/:phone (protected — requires visitor token) ──────
// Only allows looking up YOUR OWN record via the session token
router.get('/phone/:phone', authenticateVisitor, async (req, res) => {
  try {
    const phone = req.params.phone.trim();

    // Token phone must match the requested phone
    if (req.visitorSession.phone !== phone) {
      return res.status(403).json({ success: false, message: 'Token does not match this phone number' });
    }

    const visitor = await db('visitors').where({ phone }).first();
    if (!visitor) {
      return res.status(404).json({ success: false, message: 'Visitor not found' });
    }

    const activeVisit = await db('visits')
      .where({ visitor_id: visitor.id, status: 'IN' })
      .orderBy('check_in_time', 'desc')
      .first();

    res.json({ success: true, visitor, activeVisit: activeVisit || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/visitors/:uuid (protected) ─────────────────────────────────────
router.get('/:uuid', authenticateVisitor, async (req, res) => {
  try {
    const visitor = await db('visitors')
      .where('uuid', req.params.uuid)
      .first();

    if (!visitor) {
      return res.status(404).json({ success: false, message: 'Visitor not found' });
    }

    // Must own this record
    if (req.visitorSession.visitor_id !== visitor.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const activeVisit = await db('visits')
      .where({ visitor_id: visitor.id, status: 'IN' })
      .orderBy('check_in_time', 'desc')
      .first();

    res.json({ success: true, visitor, activeVisit: activeVisit || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/visitors/checkin (protected) ───────────────────────────────────
router.post('/checkin', authenticateVisitor, async (req, res) => {
  try {
    const { visitor_id, notes } = req.body;
    if (!visitor_id) return res.status(400).json({ success: false, message: 'visitor_id required' });
    if (!assertOwnership(req, res, visitor_id)) return;

    const visitor = await db('visitors').where({ id: visitor_id }).first();
    if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });

    if (visitor.induction_status !== 'passed') {
      return res.status(403).json({ success: false, message: 'Must pass HSE induction before checking in' });
    }

    const activeVisit = await db('visits').where({ visitor_id, status: 'IN' }).first();
    if (activeVisit) {
      return res.status(409).json({ success: false, message: 'Visitor already checked in', code: 'ALREADY_CHECKED_IN' });
    }

    const [row] = await db('visits').insert({
      visitor_id,
      check_in_time: new Date().toISOString(),
      status:        'IN',
      notes:         notes?.trim() || null,
    }).returning('id');

    const visit = await db('visits').where({ id: row?.id ?? row }).first();
    res.json({ success: true, message: 'Checked in successfully', visit, visitor });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/visitors/checkout (protected) ──────────────────────────────────
router.post('/checkout', authenticateVisitor, async (req, res) => {
  try {
    const { visitor_id } = req.body;
    if (!visitor_id) return res.status(400).json({ success: false, message: 'visitor_id required' });
    if (!assertOwnership(req, res, visitor_id)) return;

    const visitor = await db('visitors').where({ id: visitor_id }).first();
    if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });

    const activeVisit = await db('visits')
      .where({ visitor_id, status: 'IN' })
      .orderBy('check_in_time', 'desc')
      .first();

    if (!activeVisit) {
      return res.status(400).json({ success: false, message: 'No active check-in found', code: 'NOT_CHECKED_IN' });
    }

    await db('visits').where({ id: activeVisit.id }).update({
      check_out_time: new Date().toISOString(),
      status:         'OUT',
    });

    const updatedVisit = await db('visits').where({ id: activeVisit.id }).first();
    res.json({ success: true, message: 'Checked out successfully', visit: updatedVisit, visitor });
  } catch (err) {
    console.error('Check-out error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
