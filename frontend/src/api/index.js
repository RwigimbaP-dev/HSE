import axios from 'axios';

// ─── Axios instance ───────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor ─────────────────────────────────────────────────────
// Attaches the admin JWT and/or visitor session token to every request.
api.interceptors.request.use((config) => {
  const adminToken   = localStorage.getItem('hse_vms_token');
  const visitorToken = sessionStorage.getItem('hse_visitor_token');

  if (adminToken) {
    config.headers.Authorization = `Bearer ${adminToken}`;
  }
  if (visitorToken) {
    config.headers['X-Visitor-Token'] = visitorToken;
  }
  return config;
});

// ─── Response interceptor ────────────────────────────────────────────────────
// Handles expired admin tokens globally — forces logout instead of
// silently failing on every individual page.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code   = error.response?.data?.code;

    // Admin session expired → clear storage and redirect to login
    if (status === 401 && code === 'TOKEN_EXPIRED') {
      localStorage.removeItem('hse_vms_token');
      localStorage.removeItem('hse_vms_admin');
      // Use window.location so the full React tree re-initialises cleanly
      if (!window.location.pathname.startsWith('/admin/login')) {
        window.location.href = '/admin/login?reason=expired';
      }
    }

    // Visitor token expired → clear and redirect to register
    if (status === 401 && code === 'VISITOR_TOKEN_EXPIRED') {
      sessionStorage.removeItem('hse_visitor_token');
      if (window.location.pathname.startsWith('/visitor/')) {
        window.location.href = '/visitor/register?reason=expired';
      }
    }

    return Promise.reject(error);
  }
);

// ─── Visitor APIs ─────────────────────────────────────────────────────────────
export const visitorAPI = {
  register:   (data)         => api.post('/visitors/register', data),
  getByPhone: (phone)        => api.get(`/visitors/phone/${encodeURIComponent(phone)}`),
  getByUuid:  (uuid)         => api.get(`/visitors/${uuid}`),
  checkIn:    (visitor_id, notes) => api.post('/visitors/checkin', { visitor_id, notes }),
  checkOut:   (visitor_id)   => api.post('/visitors/checkout', { visitor_id }),
};

// ─── Quiz APIs ────────────────────────────────────────────────────────────────
export const quizAPI = {
  generate: (visitor_id, language) =>
    api.get('/quiz/generate', { params: { visitor_id, language } }),
  submit: (visitor_id, language, answers) =>
    api.post('/quiz/submit', { visitor_id, language, answers }),
};

// ─── Admin APIs ───────────────────────────────────────────────────────────────
export const adminAPI = {
  login:         (username, password) => api.post('/auth/login', { username, password }),
  logout:        ()                   => api.post('/auth/logout'),
  getDashboard:  ()                   => api.get('/admin/dashboard'),
  getVisitors:   (filters = {})       => api.get('/admin/visitors', { params: filters }),
  exportExcel:   ()                   => api.get('/admin/export', { responseType: 'blob' }),
  getDailyReport:(date)               => api.get('/admin/reports/daily', { params: { date } }),
};

// ─── Induction Content APIs ───────────────────────────────────────────────────
export const inductionAPI = {
  getActive:       (language)            => api.get('/induction/active', { params: { language } }),
  getAll:          ()                    => api.get('/induction'),
  addUrl:          (data)                => api.post('/induction/url', data),
  upload:          (formData)            => api.post('/induction/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }),
  update:          (id, data)            => api.put(`/induction/${id}`, data),
  delete:          (id)                  => api.delete(`/induction/${id}`),
  fileUrl:         (id)                  => `/api/induction/file/${id}`,
  extractPdf:      (id)                  => api.post(`/induction/${id}/extract`),
  // Quiz management
  generateQuiz:    (id, language, count) => api.post(`/induction/${id}/generate-quiz`, { language, count }),
  saveQuiz:        (id, language, questions) => api.post(`/induction/${id}/save-quiz`, { language, questions }),
  approveQuiz:     (id, language)        => api.post(`/induction/${id}/approve-quiz`, { language }),
  deleteQuiz:      (id, language)        => api.delete(`/induction/${id}/quiz`, { params: { language } }),
  getQuiz:         (id, language)        => api.get(`/induction/${id}/quiz`, { params: { language } }),
  // Legacy preview (kept for compatibility)
  previewQuiz:     (id, language = 'en') => api.post(`/induction/${id}/generate-quiz`, { language }),
  previewQuizAll:  (language = 'en')     => api.post('/induction/preview-quiz-all', { language }),
};

// ─── QR Code APIs ─────────────────────────────────────────────────────────────
export const qrAPI = {
  generate: () => api.get('/qr/generate'),
  imageUrl: '/api/qr/image',
};

export default api;
