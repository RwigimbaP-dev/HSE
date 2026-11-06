import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// Decode JWT payload (base64) without verifying signature — client-side only
function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  if (!token) return true;
  const decoded = decodeToken(token);
  if (!decoded?.exp) return true;
  // Add 10-second buffer to avoid edge cases
  return decoded.exp * 1000 < Date.now() + 10000;
}

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    try {
      const stored = localStorage.getItem('hse_vms_admin');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const [token, setToken] = useState(() => {
    const stored = localStorage.getItem('hse_vms_token');
    // Clear immediately if the stored token is already expired
    if (stored && isTokenExpired(stored)) {
      localStorage.removeItem('hse_vms_token');
      localStorage.removeItem('hse_vms_admin');
      return null;
    }
    return stored || null;
  });

  // Periodically check for token expiry while the tab is open
  useEffect(() => {
    if (!token) return;
    const decoded = decodeToken(token);
    if (!decoded?.exp) return;

    const msUntilExpiry = decoded.exp * 1000 - Date.now();
    if (msUntilExpiry <= 0) { logout(); return; }

    const timer = setTimeout(() => {
      logout();
      // Redirect to login with expiry notice
      if (!window.location.pathname.startsWith('/admin/login')) {
        window.location.href = '/admin/login?reason=expired';
      }
    }, msUntilExpiry);

    return () => clearTimeout(timer);
  }, [token]);

  const login = (adminData, jwtToken) => {
    setAdmin(adminData);
    setToken(jwtToken);
    localStorage.setItem('hse_vms_admin', JSON.stringify(adminData));
    localStorage.setItem('hse_vms_token', jwtToken);
  };

  const logout = () => {
    setAdmin(null);
    setToken(null);
    localStorage.removeItem('hse_vms_admin');
    localStorage.removeItem('hse_vms_token');
  };

  // Token must exist AND not be expired
  const isAuthenticated = !!token && !!admin && !isTokenExpired(token);

  return (
    <AuthContext.Provider value={{ admin, token, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
