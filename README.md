# Visitor Management & HSE Induction System

A full-stack professional system for visitor registration, HSE safety induction, AI-generated quiz assessment, automatic check-in/check-out, and administrator reporting.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5, React Router v6, Recharts, Axios |
| Backend | Node.js + Express, Knex.js (query builder) |
| Database | SQLite3 (file-based, zero-config) |
| Auth | JWT (8-hour sessions), bcryptjs |
| Excel | SheetJS (xlsx) |
| QR Code | qrcode library |
| Styling | Custom CSS (corporate navy theme, fully responsive) |

---

## Quick Start

### Prerequisites
- Node.js v18+ (tested on v25)
- npm v9+

### 1. Start the Backend

```powershell
cd backend
npm install
node server.js
```

Backend runs on **http://localhost:5000**

### 2. Start the Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs on **http://localhost:5173**

---

## Default Admin Credentials

| Field | Value |
|---|---|
| URL | http://localhost:5173/admin/login |
| Username | `admin` |
| Password | `Admin@HSE2024` |

> **Change these credentials** before deploying to production by editing `backend/.env`.

---

## System Features

### Visitor Flow
1. **QR Code Scan** → Visitor scans QR code at reception or visits the portal URL
2. **Language Selection** → English, French, or Kinyarwanda
3. **Registration** → Personal info, company, ID, host name, purpose
4. **HSE Video Induction** → 6-slide interactive presentation (must view ≥80%)
5. **AI-Generated Quiz** → 5 random questions from 10-question bank (per language)
6. **Pass Assessment** → Must score ≥80% (4/5 correct); unlimited retries
7. **Check-In** → Confirmed entry with timestamp recorded
8. **Check-Out** → Phone number lookup → confirms departure with duration

### Admin Dashboard
- 📊 **Dashboard** — real-time stats: total visitors, currently IN/OUT, daily count, induction pass/fail rate, 7-day trend chart
- 👥 **Visitors** — full table with search, filter by visit status / induction status / date / host; column sorting
- 📋 **Reports** — daily reports by date with summary statistics
- 🔲 **QR Code** — generate, download, and copy the visitor portal QR code
- 📥 **Excel Export** — exports all visitor records with summary sheet

### Multi-Language
- Full EN/FR/RW translations across all visitor-facing pages and admin interface
- Language persisted in localStorage

---

## API Endpoints

### Public
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/visitors/register` | Register a new visitor |
| GET | `/api/visitors/phone/:phone` | Look up visitor by phone |
| GET | `/api/visitors/:uuid` | Look up visitor by UUID |
| POST | `/api/visitors/checkin` | Check a visitor IN |
| POST | `/api/visitors/checkout` | Check a visitor OUT |
| GET | `/api/quiz/generate` | Get 5 random quiz questions |
| POST | `/api/quiz/submit` | Submit quiz answers |
| GET | `/api/qr/generate` | Get QR code as data URL |
| GET | `/api/qr/image` | Get QR code as PNG |

### Admin (requires JWT)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Admin login |
| GET | `/api/admin/dashboard` | Stats + trend data |
| GET | `/api/admin/visitors` | All visitors (filterable) |
| GET | `/api/admin/export` | Download Excel file |
| GET | `/api/admin/reports/daily` | Daily report by date |

---

## Project Structure

```
joe/
├── backend/
│   ├── database/
│   │   └── schema.js          # Knex DB init + seeding
│   ├── middleware/
│   │   └── auth.js            # JWT middleware
│   ├── routes/
│   │   ├── auth.js            # Admin login
│   │   ├── visitors.js        # Register, check-in, check-out
│   │   ├── quiz.js            # Quiz generation + grading
│   │   ├── admin.js           # Dashboard, export, reports
│   │   └── qrcode.js          # QR code generation
│   ├── .env                   # Config (JWT secret, DB path, admin creds)
│   ├── server.js              # Express app entry point
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── api/index.js        # Axios API client
    │   ├── context/
    │   │   ├── AuthContext.jsx  # Admin auth state
    │   │   └── LanguageContext.jsx
    │   ├── i18n/
    │   │   └── translations.js # EN/FR/RW strings
    │   ├── components/         # Shared UI components
    │   ├── pages/
    │   │   ├── visitor/        # Landing, Register, Induction, Quiz, CheckIn, CheckOut
    │   │   └── admin/          # Login, Layout, Dashboard, Visitors, Reports, QR
    │   ├── App.jsx             # Router
    │   ├── main.jsx
    │   └── index.css           # Corporate theme
    ├── vite.config.js
    └── package.json
```

---

## Database

SQLite file is created automatically at `backend/database/vms.db` on first startup.

**Tables:** `visitors`, `visits`, `quiz_results`, `admins`, `system_config`

---

## Production Notes

1. Update `backend/.env` — change `JWT_SECRET` and `ADMIN_PASSWORD`
2. Update `qr_base_url` in system_config to your production domain
3. Run `npm run build` in frontend, serve `dist/` via nginx or Express static
4. Consider adding a real HSE induction video by hosting it and updating `InductionPage.jsx`
