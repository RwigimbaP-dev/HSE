const jwt = require('jsonwebtoken');

// ─── Guard: JWT_SECRET must be defined ───────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('❌ FATAL: JWT_SECRET is not set or is too short (min 32 chars). Refusing to start.');
  process.exit(1);
}

// ─── Admin JWT middleware ─────────────────────────────────────────────────────
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],  // pin algorithm — prevents 'none' / RS256 tricks
    });
    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
}

// ─── Visitor session token middleware ────────────────────────────────────────
// Issued on registration, required on induction / quiz / checkin / checkout.
// Short-lived (4 h). Prevents random people from manipulating visitor records
// by guessing sequential integer IDs.
function authenticateVisitor(req, res, next) {
  const authHeader = req.headers['x-visitor-token'];
  const token = authHeader || (req.headers['authorization'] || '').replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ success: false, message: 'Visitor session token required', code: 'NO_VISITOR_TOKEN' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
    });

    if (decoded.type !== 'visitor') {
      return res.status(403).json({ success: false, message: 'Invalid visitor token type' });
    }

    // Attach visitor identity — routes can verify visitor_id matches token
    req.visitorSession = decoded; // { type, visitor_id, phone }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Visitor session expired. Please register again.', code: 'VISITOR_TOKEN_EXPIRED' });
    }
    return res.status(403).json({ success: false, message: 'Invalid visitor session token' });
  }
}

// ─── Role-based access control ───────────────────────────────────────────────
// Usage: router.delete('/...', requireRole('superadmin'), handler)
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      });
    }
    next();
  };
}

// ─── Helper: issue a visitor session token ───────────────────────────────────
function issueVisitorToken(visitorId, phone) {
  return jwt.sign(
    { type: 'visitor', visitor_id: visitorId, phone },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: process.env.VISITOR_TOKEN_TTL || '4h' }
  );
}

module.exports = { authenticateAdmin, authenticateVisitor, requireRole, issueVisitorToken };
