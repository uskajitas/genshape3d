import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signOutUser } from '../firebase';

// Allowlist of emails that can sign in. Anyone else gets signed out
// immediately and shown an "access denied" message.
const ALLOWED_EMAILS = [
  'usquiano@gmail.com',
  'uskajitas@gmail.com',
];

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  accessDenied: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  accessDenied: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      if (u && u.email && !ALLOWED_EMAILS.includes(u.email.toLowerCase())) {
        await signOutUser();
        setUser(null);
        setAccessDenied(true);
      } else {
        setUser(u);
        if (u) setAccessDenied(false);
      }
      setIsLoading(false);
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, accessDenied }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
