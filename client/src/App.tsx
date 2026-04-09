import React, { useEffect, useState, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { UserProvider, useAppUser } from './context/UserContext';

const AuthSync: React.FC = () => {
  const { isAuthenticated, user } = useAuth0();
  const { refresh } = useAppUser();
  const called = useRef(false);
  useEffect(() => {
    const email = user?.email;
    if (!isAuthenticated || !email || called.current) return;
    called.current = true;
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: user?.name || '', picture: user?.picture || '' }),
    }).then(() => refresh(email)).catch(() => { called.current = false; });
  }, [isAuthenticated, user?.email]);
  return null;
};

const App: React.FC = () => {
  const { isLoading } = useAuth0();
  // Safety timeout: if Auth0 hasn't resolved in 3s (e.g. unconfigured / network
  // issue), unblock the UI and run in guest mode.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);

  if (isLoading && !timedOut) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#07060f',
        color: '#9d93b8',
        fontFamily: 'Inter, sans-serif',
        fontSize: '0.9rem',
        gap: '0.75rem',
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

export default App;
