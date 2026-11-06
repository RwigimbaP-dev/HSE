require("dotenv").config();

// ─── Critical env checks BEFORE anything else ────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error(
    "\n❌ FATAL: JWT_SECRET is missing or too short (minimum 32 characters).",
  );
  console.error("   Set it in backend/.env and restart.\n");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const { initializeDatabase } = require("./database/schema");

// Initialize database (async — server starts after it resolves)
initializeDatabase().catch((err) => {
  console.error("❌ Database init failed:", err.message);
  process.exit(1);
});

const app = express();

// ─── Trust proxy (needed for correct IP behind nginx / load balancer) ─────────
// Number of proxies in front of the app. Render alone = 1; Vercel rewrite + Render = 2.
app.set("trust proxy", parseInt(process.env.TRUST_PROXY || "1", 10));

// ─── Helmet — security headers ────────────────────────────────────────────────
app.use(
  helmet({
    // X-Frame-Options: disabled globally — we control framing via CSP frame-src instead
    frameguard: false,
    // COEP must be disabled — it blocks PDF/video files loaded in iframes from same origin
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "blob:"],
        // Allow iframes from: same origin (PDF/video files), YouTube, Vimeo
        frameSrc: [
          "'self'",
          "blob:",
          "https://www.youtube.com",
          "https://player.vimeo.com",
        ],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    // Allow files (PDF/video) to be loaded cross-origin from the same server
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts:
      process.env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
  }),
);

// ─── CORS — tighten allowed origins ──────────────────────────────────────────
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173")
  .trim()
  .replace(/\/+$/, "");
const rawAllowed = process.env.CORS_EXTRA_ORIGINS || "";
const extraOrigins = rawAllowed
  ? rawAllowed.split(",").map((o) => o.trim().replace(/\/+$/, ""))
  : [];

const allowedOrigins = Array.from(
  new Set([
    FRONTEND_URL,
    // Dev-only extra origins — removed in production unless explicitly set
    ...(process.env.NODE_ENV !== "production"
      ? ["http://localhost:3000", "http://127.0.0.1:5173"]
      : []),
    ...extraOrigins,
  ]),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin))
        return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Visitor-Token"],
  }),
);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" })); // tightened from 10mb
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ─── Rate limiters ────────────────────────────────────────────────────────────
// Auth: strict — 10 attempts per 15 min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 15 minutes.",
  },
  keyGenerator: (req) => req.ip,
});

// Registration: 20 per 10 min per IP
const registerLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many registration attempts. Please slow down.",
  },
});

// Quiz: 30 per 10 min per IP (retries allowed but not spammable)
const quizLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many quiz attempts. Please wait before trying again.",
  },
});

// General API: 300 per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please slow down." },
});

app.use("/api/", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/visitors/register", registerLimiter);
app.use("/api/quiz/", quizLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth"));
app.use("/api/visitors", require("./routes/visitors"));
app.use("/api/quiz", require("./routes/quiz"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/qr", require("./routes/qrcode"));
app.use("/api/induction", require("./routes/induction"));

// Serve uploaded induction files — disable directory listing, allow inline serving
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    dotfiles: "deny",
    index: false,
  }),
);

// ─── Health check (public) ────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "HSE VMS API is running",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use("/api/*", (req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Don't expose internal errors in production
  const isDev = process.env.NODE_ENV === "development";
  console.error(`[${new Date().toISOString()}] Server error:`, err.message);
  res.status(err.status || 500).json({
    success: false,
    message: isDev ? err.message : "Internal server error",
  });
});

const PORT = parseInt(process.env.PORT || "5000", 10);
app.listen(PORT, () => {
  console.log(`\n🚀 HSE VMS Backend  →  http://localhost:${PORT}`);
  console.log(
    `   Environment      :  ${process.env.NODE_ENV || "development"}`,
  );
  console.log(`   Security headers :  helmet ✔`);
  console.log(`   CORS origins     :  ${allowedOrigins.join(", ")}`);
  console.log(`   API Health       :  http://localhost:${PORT}/api/health\n`);
});
