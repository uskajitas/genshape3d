import React, { useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { UserProvider, useAppUser } from './context/UserContext';

const AuthSync: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { refresh } = useAppUser();
  const called = useRef(false);

  useEffect(() => {
    const email = user?.email;
    if (!isAuthenticated || !email || called.current) return;
    called.current = true;
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: user?.displayName || '', picture: user?.photoURL || '' }),
    }).then(() => refresh(email)).catch(() => { called.current = false; });
  }, [isAuthenticated, user?.email]);

  return null;
};

const App: React.FC = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#07060f',
        color: '#9d93b8', fontFamily: 'Inter, sans-serif', fontSize: '0.9rem', gap: '0.75rem',
      }}>
        <span style={{ fontSize: '1.5rem' }}>⬡</span>
        Loading GenShape3D…
      </div>
    );
  }

  return (
    <UserProvider>
      <AuthSync />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </UserProvider>
  );
};

const AppWithAuth: React.FC = () => (
  <AuthProvider>
    <App />
  </AuthProvider>
);

export default AppWithAuth;
