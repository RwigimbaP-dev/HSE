const { db } = require('../database/schema');

const MAX = 20000; // characters kept per JSON field

const toJson = (v) => {
  if (v === undefined || v === null) return null;
  try {
    const str = JSON.stringify(v);
    return str.length > MAX ? str.slice(0, MAX) : str;
  } catch { return null; }
};

/**
 * Write one row to the audit trail. NEVER throws — a logging problem must
 * not break the action that is being logged.
 *
 * entry = {
 *   action, category,
 *   actor?: { type, id, name }      // defaults to the signed-in admin (req.admin)
 *   entity_type?, entity_id?, entity_label?,
 *   reason?, before?, after?, details?
 * }
 */
async function audit(req, entry) {
  try {
    const actor = entry.actor
      || (req?.admin
        ? { type: 'admin', id: req.admin.id, name: req.admin.fullName || req.admin.username }
        : { type: 'system', id: null, name: 'System' });

    await db('audit_logs').insert({
      actor_type:   actor.type,
      actor_id:     actor.id ?? null,
      actor_name:   actor.name ? String(actor.name).slice(0, 200) : null,
      action:       entry.action,
      category:     entry.category,
      entity_type:  entry.entity_type || null,
      entity_id:    entry.entity_id != null ? String(entry.entity_id) : null,
      entity_label: entry.entity_label ? String(entry.entity_label).slice(0, 250) : null,
      reason:       entry.reason || null,
      before_data:  toJson(entry.before),
      after_data:   toJson(entry.after),
      details:      toJson(entry.details),
      ip_address:   req?.ip || null,
      user_agent:   (req?.headers?.['user-agent'] || '').slice(0, 500) || null,
    });
  } catch (err) {
    console.warn('audit insert failed:', err.message);
  }
}

/** Only the fields that actually changed, as { before, after } objects. */
function diffObjects(before, after, fields) {
  const b = {}; const a = {};
  for (const f of fields) {
    const x = before?.[f] ?? null;
    const y = after?.[f] ?? null;
    if (String(x ?? '') !== String(y ?? '')) { b[f] = x; a[f] = y; }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}

const visitorActor = (v) => ({
  type: 'visitor',
  id:   v.id,
  name: `${v.first_name || ''} ${v.last_name || ''}`.trim() || `Visitor #${v.id}`,
});

module.exports = { audit, diffObjects, visitorActor };
