const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../database/schema");
const { validate, loginRules } = require("../middleware/validate");
const { audit } = require("../utils/audit");

// Dummy hash — compared when user doesn't exist to prevent timing attacks
const DUMMY_HASH =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

// POST /api/auth/login
router.post("/login", validate(loginRules), async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await db("admins")
      .where({ username: username.trim().toLowerCase() })
      .first();

    // Always run bcrypt.compare — even when user not found — to prevent timing attacks
    const hashToCheck = admin ? admin.password : DUMMY_HASH;
    const validPassword = await bcrypt.compare(password, hashToCheck);

    if (!admin || !validPassword) {
      await audit(req, {
        actor: {
          type: "system",
          id: null,
          name: `Unknown (${String(username).trim().slice(0, 60)})`,
        },
        action: "auth.login_failed",
        category: "auth",
        details: {
          username: String(username).trim().slice(0, 60),
          reason: admin ? "wrong password" : "unknown user",
        },
      });
      // Identical message for both cases — no username enumeration
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    // Update last login timestamp
    await db("admins")
      .where({ id: admin.id })
      .update({ last_login: new Date().toISOString() });

    await audit(req, {
      actor: {
        type: "admin",
        id: admin.id,
        name: admin.full_name || admin.username,
      },
      action: "auth.login",
      category: "auth",
      entity_type: "admin",
      entity_id: admin.id,
      entity_label: admin.username,
    });

    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        fullName: admin.full_name,
      },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        fullName: admin.full_name,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  // Logout is public (JWT is stateless) — record who it was if the token is still valid
  try {
    const token = (req.headers["authorization"] || "").split(" ")[1];
    const d =
      token &&
      jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (d)
      await audit(req, {
        actor: { type: "admin", id: d.id, name: d.fullName || d.username },
        action: "auth.logout",
        category: "auth",
        entity_type: "admin",
        entity_id: d.id,
        entity_label: d.username,
      });
  } catch (_) {}
  // JWT is stateless — client removes the token.
  // The response confirms the action; no server-side invalidation required
  // (a token blocklist can be added here in future if needed).
  res.json({ success: true, message: "Logged out successfully" });
});

module.exports = router;
