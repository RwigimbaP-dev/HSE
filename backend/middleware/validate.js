const { body, param, query, validationResult } = require('express-validator');

// ─── Reusable validation runner ───────────────────────────────────────────────
function validate(rules) {
  return async (req, res, next) => {
    await Promise.all(rules.map((rule) => rule.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }
    next();
  };
}

// ─── Visitor registration rules ───────────────────────────────────────────────
const registerRules = [
  body('first_name').trim().notEmpty().withMessage('First name is required').isLength({ max: 100 }),
  body('last_name').trim().notEmpty().withMessage('Last name is required').isLength({ max: 100 }),
  body('phone')
    .trim().notEmpty().withMessage('Phone number is required')
    .matches(/^\+?[\d\s\-().]{7,20}$/).withMessage('Invalid phone number format'),
  body('email').optional().trim().isEmail().withMessage('Invalid email address').isLength({ max: 200 }),
  body('company').trim().notEmpty().withMessage('Company is required').isLength({ max: 200 }),
  body('host_name').trim().notEmpty().withMessage('Host name is required').isLength({ max: 200 }),
  body('host_department').optional().trim().isLength({ max: 200 }),
  body('purpose')
    .trim().notEmpty().withMessage('Purpose is required')
    .isIn(['meeting', 'delivery', 'maintenance', 'interview', 'training', 'audit', 'other'])
    .withMessage('Invalid purpose value'),
  body('id_type')
    .trim().notEmpty().withMessage('ID type is required')
    .isIn(['national_id', 'passport', 'drivers_license', 'company_id'])
    .withMessage('Invalid ID type'),
  body('id_number').trim().notEmpty().withMessage('ID number is required').isLength({ max: 100 }),
  body('language').optional().isIn(['en', 'fr', 'rw']).withMessage('Invalid language code'),
];

// ─── Quiz submit rules ────────────────────────────────────────────────────────
const quizSubmitRules = [
  body('visitor_id').isInt({ min: 1 }).withMessage('Invalid visitor_id'),
  body('language').optional().isIn(['en', 'fr', 'rw']),
  body('answers')
    .isArray({ min: 1, max: 10 }).withMessage('answers must be an array of 1–10 items'),
  body('answers.*.question_id').isInt({ min: 1 }).withMessage('Each answer must have a valid question_id'),
  body('answers.*.selected').isInt({ min: 0, max: 3 }).withMessage('Each answer.selected must be 0–3'),
];

// ─── Admin login rules ────────────────────────────────────────────────────────
const loginRules = [
  body('username').trim().notEmpty().withMessage('Username required').isLength({ max: 100 }),
  body('password').notEmpty().withMessage('Password required').isLength({ max: 200 }),
];

// ─── Config update rules ──────────────────────────────────────────────────────
const configUpdateRules = [
  param('key')
    .isIn(['company_name', 'qr_base_url', 'video_min_watch_percent', 'quiz_pass_score', 'quiz_questions_count'])
    .withMessage('Unknown config key'),
  body('value').trim().notEmpty().withMessage('value is required').isLength({ max: 500 }),
];

module.exports = {
  validate,
  registerRules,
  quizSubmitRules,
  loginRules,
  configUpdateRules,
};
