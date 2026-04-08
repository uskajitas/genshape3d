import React, { createContext, useContext, useState, useCallback } from 'react';

export type UserRole = 'guest' | 'free' | 'pro' | 'admin';

export interface AppUserState {
  role: UserRole;
  approved: boolean;
  loaded: boolean;
  credits: number;
  email?: string;
  name?: string;
  picture?: string;
}

interface UserContextValue {
  appUser: AppUserState;
  setAppUser: (u: AppUserState) => void;
  refresh: (email: string) => Promise<AppUserState>;
}

const DEFAULT: AppUserState = {
  role: 'guest',
  approved: false,
  loaded: false,
  credits: 0,
};

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';

export const UserContext = createContext<UserContextValue>({
  appUser: DEFAULT,
  setAppUser: () => {},
  refresh: async () => DEFAULT,
});

export const useAppUser = () => useContext(UserContext);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appUser, setAppUser] = useState<AppUserState>(DEFAULT);

  const refresh = useCallback(async (email: string): Promise<AppUserState> => {
    try {
      const r = await fetch(`${BASE}/api/auth/me?email=${encodeURIComponent(email)}`);
      const data = await r.json();
      const creditMap: Record<UserRole, number> = { guest: 0, free: 10, pro: 200, admin: 9999 };
      const role: UserRole = data.role ?? 'free';
      const next: AppUserState = {
        role,
        approved: Boolean(data.approved),
        loaded: true,
        credits: data.credits ?? creditMap[role],
        email: data.email ?? email,
        name: data.name,
        picture: data.picture,
      };
      setAppUser(next);
      return next;
    } catch {
      const fallback: AppUserState = { ...DEFAULT, loaded: true };
      setAppUser(fallback);
      return fallback;
    }
  }, []);

  return (
    <UserContext.Provider value={{ appUser, setAppUser, refresh }}>
      {children}
    </UserContext.Provider>
  );
};
