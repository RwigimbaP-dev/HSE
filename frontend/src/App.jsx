import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { VisitorProvider } from './context/VisitorContext';

// Visitor pages
import LandingPage from './pages/visitor/LandingPage';
import RegistrationPage from './pages/visitor/RegistrationPage';
import InductionPage from './pages/visitor/InductionPage';
import QuizPage from './pages/visitor/QuizPage';
import CheckInPage from './pages/visitor/CheckInPage';
import CheckOutPage from './pages/visitor/CheckOutPage';

// Admin pages
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminLayout from './pages/admin/AdminLayout';
import DashboardPage from './pages/admin/DashboardPage';
import VisitorsPage from './pages/admin/VisitorsPage';
import ReportsPage from './pages/admin/ReportsPage';
import QRCodePage from './pages/admin/QRCodePage';
import InductionManagerPage from './pages/admin/InductionManagerPage';

// ─── PrivateRoute — redirects unauthenticated users to /admin/login ───────────
function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Preserve the attempted URL so we can redirect back after login
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }
  return children;
}

// ─── AlreadyLoggedIn — redirects authenticated admins away from login page ───
function AlreadyLoggedIn({ children }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <VisitorProvider>
          <LanguageProvider>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '0.9rem',
                  maxWidth: 400,
                },
                success: { iconTheme: { primary: '#276749', secondary: '#fff' } },
                error:   { iconTheme: { primary: '#c53030', secondary: '#fff' } },
              }}
            />
            <Routes>
              {/* ── Visitor-facing routes (public) ─── */}
              <Route path="/"                    element={<LandingPage />} />
              <Route path="/visitor"             element={<LandingPage />} />
              <Route path="/visitor/register"    element={<RegistrationPage />} />
              <Route path="/visitor/induction"   element={<InductionPage />} />
              <Route path="/visitor/quiz"        element={<QuizPage />} />
              <Route path="/visitor/checkin"     element={<CheckInPage />} />
              <Route path="/visitor/checkout"    element={<CheckOutPage />} />

              {/* ── Admin routes ─── */}
              {/* Login page: redirect away if already authenticated */}
              <Route
                path="/admin/login"
                element={
                  <AlreadyLoggedIn>
                    <AdminLoginPage />
                  </AlreadyLoggedIn>
                }
              />

              {/* Protected admin layout — all child routes need a valid JWT */}
              <Route
                path="/admin"
                element={
                  <PrivateRoute>
                    <AdminLayout />
                  </PrivateRoute>
                }
              >
                <Route index element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="visitors"  element={<VisitorsPage />} />
                <Route path="induction" element={<InductionManagerPage />} />
                <Route path="reports"   element={<ReportsPage />} />
                <Route path="qr"        element={<QRCodePage />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </LanguageProvider>
        </VisitorProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
