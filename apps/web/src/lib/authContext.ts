import { createContext, useContext } from 'react';
import type { StoredAuth } from './api';

export interface AuthContextValue {
  auth: StoredAuth | null;
  login: (email: string, password: string) => Promise<StoredAuth>;
  register: (input: {
    email: string;
    password: string;
    name: string;
    invitationCode: string;
  }) => Promise<StoredAuth>;
  registerTeacher: (input: {
    token: string;
    name: string;
    password: string;
  }) => Promise<StoredAuth>;
  logout: () => Promise<void>;
  // Exchange the stored refresh token for a fresh access + refresh pair and
  // persist them. Used by the session-expiry warning's "Stay signed in"
  // button. Throws if there's no refresh token or the server rejects it.
  refresh: () => Promise<StoredAuth>;
  isLoading: boolean;
}

export const AuthCtx = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
