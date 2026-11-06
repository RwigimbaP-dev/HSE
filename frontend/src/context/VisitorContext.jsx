import { createContext, useContext, useState } from 'react';

// Stores the short-lived visitor session token issued on registration.
// All subsequent visitor API calls (induction, quiz, check-in, checkout)
// send this token in the X-Visitor-Token header.
const VisitorContext = createContext(null);

export function VisitorProvider({ children }) {
  const [visitorToken, setVisitorToken] = useState(
    () => sessionStorage.getItem('hse_visitor_token') || null
  );

  const saveToken = (token) => {
    setVisitorToken(token);
    sessionStorage.setItem('hse_visitor_token', token);
  };

  const clearToken = () => {
    setVisitorToken(null);
    sessionStorage.removeItem('hse_visitor_token');
  };

  return (
    <VisitorContext.Provider value={{ visitorToken, saveToken, clearToken }}>
      {children}
    </VisitorContext.Provider>
  );
}

export function useVisitor() {
  const ctx = useContext(VisitorContext);
  if (!ctx) throw new Error('useVisitor must be used within VisitorProvider');
  return ctx;
}
