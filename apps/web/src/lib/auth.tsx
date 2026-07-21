import { createContext, type ReactNode, useContext, useState } from 'react';
import { api } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function storedUser(): User | null {
  const raw = localStorage.getItem('ledger_user');
  if (!raw) return null;
  try { return JSON.parse(raw) as User; } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(storedUser);

  async function login(username: string, password: string) {
    const result = await api.post<{ accessToken: string; user: User }>('/auth/login', { username, password });
    localStorage.setItem('ledger_token', result.accessToken);
    localStorage.setItem('ledger_user', JSON.stringify(result.user));
    setUser(result.user);
  }

  function logout() {
    localStorage.removeItem('ledger_token');
    localStorage.removeItem('ledger_user');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
