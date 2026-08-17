import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Workspace from './pages/Workspace';
import TextToImage from './pages/TextToImage';
import AdminStats from './pages/AdminStats';
import AdminScenesRoadmap from './pages/AdminScenesRoadmap';
import { BenchmarkShell } from './pages/benchmark/index';
import { UserProvider, useAppUser } from './context/UserContext';
import { ConfirmHost } from './components/ConfirmModal';

const AuthSync: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { refresh } = useAppUser();

  // Sync the Firebase login with our backend and load the user's role.
  // Retries with backoff until it succeeds — the old one-shot version left
  // the user stuck as "guest/Free user" after any transient backend failure
  // (server restart, proxy hiccup, DB blip), which read as "login didn't
  // work" until a full page reload.
  useEffect(() => {
    const email = user?.email;
    if (!isAuthenticated || !email) return;
    let cancelled = false;

    (async () => {
      for (let attempt = 1; !cancelled; attempt++) {
        try {
          const r = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name: user?.displayName || '', picture: user?.photoURL || '' }),
          });
          if (!r.ok) throw new Error(`auth/login ${r.status}`);
          await refresh(email);
          return; // synced
        } catch (e) {
          if (attempt >= 8) {
            console.error('[AuthSync] giving up after 8 attempts:', e);
            return;
          }
          // 1s, 2s, 4s… capped at 15s between tries
          await new Promise(res => setTimeout(res, Math.min(1000 * 2 ** (attempt - 1), 15000)));
        }
      }
    })();

    return () => { cancelled = true; };
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
        <Route path="/dashboard" element={<Workspace />} />
        <Route path="/dashboard/text" element={<TextToImage />} />
        <Route path="/admin/stats" element={<AdminStats />} />
        <Route path="/admin/scenes" element={<AdminScenesRoadmap />} />
        <Route path="/benchmark/*" element={<BenchmarkShell />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ConfirmHost />
    </UserProvider>
  );
};

const AppWithAuth: React.FC = () => (
  <AuthProvider>
    <App />
  </AuthProvider>
);

export default AppWithAuth;
