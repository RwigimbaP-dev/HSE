const knex = require("knex");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// ─── Read all DB config from .env ─────────────────────────────────────────────
const DB_CLIENT = process.env.DB_CLIENT || "pg";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = parseInt(process.env.DB_PORT || "5432", 10);
const DB_NAME = process.env.DB_NAME || "hse_vms";
const DB_USER = process.env.DB_USER || "postgres";
const DB_PASSWORD = process.env.DB_PASSWORD || "postgres";
const DB_DEBUG = process.env.DB_DEBUG === "true";
const DB_POOL_MIN = parseInt(process.env.DB_POOL_MIN || "2", 10);
const DB_POOL_MAX = parseInt(process.env.DB_POOL_MAX || "10", 10);
const DB_SSL = process.env.DB_SSL === "true";

const connection = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: DB_SSL ? { rejectUnauthorized: false } : false,
    }
  : {
      host: DB_HOST,
      port: DB_PORT,
      database: DB_NAME,
      user: DB_USER,
      password: DB_PASSWORD,
      ssl: DB_SSL ? { rejectUnauthorized: false } : false,
    };

const db = knex({
  client: DB_CLIENT,
  connection,
  debug: DB_DEBUG,
  pool: {
    min: DB_POOL_MIN,
    max: DB_POOL_MAX,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 600000,
  },
});

// ─── Safe table creation using hasTable() ─────────────────────────────────────
async function createIfMissing(tableName, buildFn) {
  const exists = await db.schema.hasTable(tableName);
  if (!exists) {
    await db.schema.createTable(tableName, buildFn);
    console.log(`  ✔ Created table: ${tableName}`);
  }
}

// ─── Main init ────────────────────────────────────────────────────────────────
async function initializeDatabase() {
  console.log(`\n📂 Database : ${DB_NAME}`);
  console.log(`   Host     : ${DB_HOST}:${DB_PORT}`);
  console.log(`   User     : ${DB_USER}`);
  console.log(
    `   Client   : ${DB_CLIENT}  |  Debug: ${DB_DEBUG}  |  Pool: ${DB_POOL_MIN}–${DB_POOL_MAX}\n`,
  );

  // Test the connection before doing anything else
  try {
    await db.raw("SELECT 1");
    console.log("  ✔ PostgreSQL connection successful\n");
  } catch (err) {
    console.error("\n❌ Cannot connect to PostgreSQL!");
    console.error(`   Host     : ${DB_HOST}:${DB_PORT}`);
    console.error(`   Database : ${DB_NAME}`);
    console.error(`   User     : ${DB_USER}`);
    console.error(`   Error    : ${err.message}`);
    console.error(
      "\n   → Check that PostgreSQL is running and DB_PASSWORD in .env is correct.\n",
    );
    process.exit(1);
  }

  // ── Tables ──────────────────────────────────────────────────────────────────
  await createIfMissing("visitors", (t) => {
    t.increments("id").primary();
    t.string("uuid").unique().notNullable();
    t.string("first_name").notNullable();
    t.string("last_name").notNullable();
    t.string("email");
    t.string("phone").notNullable();
    t.string("company").notNullable();
    t.string("host_name").notNullable();
    t.string("host_department");
    t.string("purpose").notNullable();
    t.string("id_type").notNullable();
    t.string("id_number").notNullable();
    t.string("language").defaultTo("en");
    t.string("induction_status").defaultTo("pending");
    t.integer("quiz_score").defaultTo(0);
    t.integer("quiz_attempts").defaultTo(0);
    t.timestamp("created_at").defaultTo(db.fn.now());
  });

  await createIfMissing("visits", (t) => {
    t.increments("id").primary();
    t.integer("visitor_id")
      .notNullable()
      .references("id")
      .inTable("visitors")
      .onDelete("CASCADE");
    t.timestamp("check_in_time");
    t.timestamp("check_out_time");
    t.string("status").defaultTo("IN");
    t.text("notes");
    t.timestamp("created_at").defaultTo(db.fn.now());
  });

  await createIfMissing("quiz_results", (t) => {
    t.increments("id").primary();
    t.integer("visitor_id")
      .notNullable()
      .references("id")
      .inTable("visitors")
      .onDelete("CASCADE");
    t.integer("score").notNullable(); // percentage 0–100
    t.integer("correct_count").notNullable(); // raw number correct
    t.integer("total_questions").notNullable();
    t.integer("passed").notNullable(); // 1 = pass, 0 = fail
    t.string("language").defaultTo("en");
    t.integer("attempt_number").defaultTo(1);
    t.timestamp("created_at").defaultTo(db.fn.now());
  });

  await createIfMissing("quiz_answers", (t) => {
    t.increments("id").primary();
    t.integer("quiz_result_id")
      .notNullable()
      .references("id")
      .inTable("quiz_results")
      .onDelete("CASCADE");
    t.integer("visitor_id")
      .notNullable()
      .references("id")
      .inTable("visitors")
      .onDelete("CASCADE");
    t.integer("question_id").notNullable();
    t.text("question_text").notNullable();
    t.integer("selected_option").notNullable();
    t.text("selected_text").notNullable();
    t.integer("correct_option").notNullable();
    t.text("correct_text").notNullable();
    t.integer("is_correct").notNullable(); // 1 = correct, 0 = wrong
    t.string("language").defaultTo("en");
    t.integer("attempt_number").defaultTo(1);
    t.timestamp("created_at").defaultTo(db.fn.now());
  });

  await createIfMissing("admins", (t) => {
    t.increments("id").primary();
    t.string("username").unique().notNullable();
    t.string("password").notNullable();
    t.string("full_name").notNullable();
    t.string("role").defaultTo("admin");
    t.timestamp("last_login");
    t.timestamp("created_at").defaultTo(db.fn.now());
  });

  await createIfMissing("system_config", (t) => {
    t.increments("id").primary();
    t.string("key").unique().notNullable();
    t.string("value").notNullable();
    t.timestamp("updated_at").defaultTo(db.fn.now());
  });

  await createIfMissing("admin_logs", (t) => {
    t.increments("id").primary();
    t.integer("admin_id")
      .references("id")
      .inTable("admins")
      .onDelete("SET NULL");
    t.string("action").notNullable();
    t.text("details");
    t.string("ip_address");
    t.timestamp("created_at").defaultTo(db.fn.now());
  });

  // Admin-written quiz question bank (questions + answer options)
  await createIfMissing("quiz_questions", (t) => {
    t.increments("id").primary();
    t.string("language").notNullable().defaultTo("all").index(); // en | fr | rw | all
    t.text("question_text").notNullable();
    t.text("explanation");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("sort_order").defaultTo(0);
    t.integer("created_by")
      .references("id")
      .inTable("admins")
      .onDelete("SET NULL");
    t.timestamp("created_at").defaultTo(db.fn.now());
    t.timestamp("updated_at").defaultTo(db.fn.now());
  });

  await createIfMissing("quiz_options", (t) => {
    t.increments("id").primary();
    t.integer("question_id")
      .notNullable()
      .references("id")
      .inTable("quiz_questions")
      .onDelete("CASCADE")
      .index();
    t.text("option_text").notNullable();
    t.boolean("is_correct").notNullable().defaultTo(false);
    t.integer("sort_order").defaultTo(0);
  });

  // One quiz, all languages: translations of each question are kept as JSON on the question
  if (!(await db.schema.hasColumn("quiz_questions", "translations"))) {
    await db.schema.table("quiz_questions", (t) => t.text("translations"));
    console.log("  ✔ Added column: quiz_questions.translations");
  }

  // Append-only audit trail: who did what, when, from where, why, and what changed.
  // Nothing in the app edits or deletes rows here.
  await createIfMissing("audit_logs", (t) => {
    t.increments("id").primary();
    t.timestamp("created_at").defaultTo(db.fn.now()).index();
    t.string("actor_type").notNullable().defaultTo("system"); // admin | visitor | system
    t.integer("actor_id");
    t.string("actor_name");
    t.string("action").notNullable().index(); // e.g. visitor.update
    t.string("category").notNullable().index(); // auth | visitor | visit | quiz | induction | system
    t.string("entity_type");
    t.string("entity_id");
    t.string("entity_label");
    t.text("reason");
    t.text("before_data");
    t.text("after_data");
    t.text("details");
    t.string("ip_address");
    t.text("user_agent");
  });

  await createIfMissing("qr_scans", (t) => {
    t.increments("id").primary();
    t.string("ip_address");
    t.string("user_agent");
    t.timestamp("scanned_at").defaultTo(db.fn.now());
  });

  // ── Induction content (admin-managed video URLs and PDF files) ──────────────
  await createIfMissing("induction_content", (t) => {
    t.increments("id").primary();
    t.string("title").notNullable();
    t.text("description");
    t.string("type").notNullable(); // 'video_url' | 'video_upload' | 'pdf'
    t.string("language").defaultTo("all"); // 'en' | 'fr' | 'rw' | 'all'
    t.text("url"); // for video_url: YouTube/Vimeo link
    t.string("file_path"); // for uploaded file: relative server path
    t.string("file_name"); // original filename
    t.bigInteger("file_size"); // bytes
    t.string("mime_type");
    t.integer("duration_seconds"); // video duration hint (optional)
    t.text("content_text"); // auto-extracted text from PDFs
    t.text("key_points"); // admin-entered key safety points for videos
    t.boolean("is_active").defaultTo(true); // only active ones shown to visitors
    t.integer("sort_order").defaultTo(0); // display order
    t.integer("created_by")
      .references("id")
      .inTable("admins")
      .onDelete("SET NULL");
    t.timestamp("created_at").defaultTo(db.fn.now());
    t.timestamp("updated_at").defaultTo(db.fn.now());
  });

  // Add columns to existing table if they don't exist (for upgrades)
  const hasContentText = await db.schema.hasColumn(
    "induction_content",
    "content_text",
  );
  if (!hasContentText) {
    await db.schema.table("induction_content", (t) => t.text("content_text"));
    console.log("  ✔ Added column: induction_content.content_text");
  }
  const hasKeyPoints = await db.schema.hasColumn(
    "induction_content",
    "key_points",
  );
  if (!hasKeyPoints) {
    await db.schema.table("induction_content", (t) => t.text("key_points"));
    console.log("  ✔ Added column: induction_content.key_points");
  }

  // Cloud-stored uploads (Cloudinary) — files here survive server restarts
  for (const [col, label] of [
    ["cloud_public_id", "cloud_public_id"],
    ["cloud_resource_type", "cloud_resource_type"],
  ]) {
    if (!(await db.schema.hasColumn("induction_content", col))) {
      await db.schema.table("induction_content", (t) => t.string(col));
      console.log(`  ✔ Added column: induction_content.${label}`);
    }
  }

  // ── AI-generated quiz questions cache ──────────────────────────────────────
  // Stores generated question sets so retries within the same session are consistent
  await createIfMissing("quiz_question_cache", (t) => {
    t.increments("id").primary();
    t.integer("visitor_id")
      .notNullable()
      .references("id")
      .inTable("visitors")
      .onDelete("CASCADE");
    t.integer("induction_id")
      .references("id")
      .inTable("induction_content")
      .onDelete("SET NULL");
    t.string("language").defaultTo("en");
    t.integer("attempt_number").defaultTo(1);
    t.jsonb("questions").notNullable(); // full question array with correct answers
    t.timestamp("expires_at").notNullable(); // cached questions expire after 2 hours
    t.timestamp("created_at").defaultTo(db.fn.now());
  });

  // ── Admin-approved quiz questions for each induction content item ───────────
  // Admin generates and reviews questions, then approves them.
  // Visitors always get these questions first (falling back to default pool).
  await createIfMissing("induction_quizzes", (t) => {
    t.increments("id").primary();
    t.integer("induction_content_id")
      .notNullable()
      .references("id")
      .inTable("induction_content")
      .onDelete("CASCADE");
    t.string("language").defaultTo("all"); // 'en' | 'fr' | 'rw' | 'all'
    t.jsonb("questions").notNullable(); // array of approved question objects
    t.boolean("is_approved").defaultTo(false); // admin must approve before visitors see
    t.string("generated_by").defaultTo("local"); // 'local' | 'ai'
    t.integer("question_count").defaultTo(0);
    t.timestamp("approved_at");
    t.timestamp("created_at").defaultTo(db.fn.now());
    t.timestamp("updated_at").defaultTo(db.fn.now());
  });

  // ── Global approved quiz pool ──────────────────────────────────────────────
  // Stores the merged, ready-to-serve quiz set across all content items.
  // Rebuilt whenever admin approves/regenerates a quiz.
  await createIfMissing("active_quiz_pool", (t) => {
    t.increments("id").primary();
    t.string("language").notNullable();
    t.jsonb("questions").notNullable(); // full questions with correct answers
    t.integer("total").defaultTo(0);
    t.timestamp("updated_at").defaultTo(db.fn.now());
  });

  // ── Seed default admin ──────────────────────────────────────────────────────
  // Login lowercases the username, so always store it lowercase.
  const adminUser = (process.env.ADMIN_USERNAME || "admin")
    .trim()
    .toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || "Admin@HSE2024";
  const adminExists = await db("admins").where({ username: adminUser }).first();

  if (!adminExists) {
    await db("admins").insert({
      username: adminUser,
      password: bcrypt.hashSync(adminPass, 10),
      full_name: "System Administrator",
      role: "superadmin",
    });
    console.log(`  ✔ Default admin created  →  username: ${adminUser}`);
  } else if (process.env.RESET_ADMIN_PASSWORD === "true") {
    // Set RESET_ADMIN_PASSWORD=true on Render, redeploy, log in, then remove it.
    await db("admins")
      .where({ id: adminExists.id })
      .update({ password: bcrypt.hashSync(adminPass, 10) });
    console.log(
      `  ✔ Admin password reset from ADMIN_PASSWORD for: ${adminUser}`,
    );
  }

  // ── Seed system_config (values from .env) ───────────────────────────────────
  const configs = [
    {
      key: "company_name",
      value: process.env.COMPANY_NAME || "Your Company Name",
    },
    {
      key: "qr_base_url",
      value: (process.env.FRONTEND_URL || "http://localhost:5173")
        .trim()
        .replace(/\/+$/, ""),
    },
    {
      key: "video_min_watch_percent",
      value: process.env.VIDEO_MIN_WATCH_PERCENT || "80",
    },
    { key: "quiz_pass_score", value: process.env.QUIZ_PASS_SCORE || "80" },
    {
      key: "quiz_questions_count",
      value: process.env.QUIZ_QUESTIONS_COUNT || "5",
    },
  ];

  for (const cfg of configs) {
    const exists = await db("system_config").where({ key: cfg.key }).first();
    if (!exists) await db("system_config").insert(cfg);
    // Keep the QR link in sync with FRONTEND_URL so changing the env var takes effect
    else if (
      cfg.key === "qr_base_url" &&
      process.env.FRONTEND_URL &&
      exists.value !== cfg.value
    ) {
      await db("system_config")
        .where({ key: cfg.key })
        .update({ value: cfg.value });
    }
  }

  console.log("\n✅ Database initialized successfully\n");
}

module.exports = { db, initializeDatabase };
