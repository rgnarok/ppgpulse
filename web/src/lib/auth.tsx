import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, tokenStore, loginRequest, logoutRequest } from './api';
import type { Me } from './types';

interface AuthContextValue {
  me: Me | null | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(() => !!tokenStore.getAccess());

  const { data: me, isLoading } = useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: async () => {
      if (!tokenStore.getAccess()) return null;
      try {
        return await api<Me>('/me');
      } catch {
        return null;
      }
    },
    enabled: hasToken,
    staleTime: 60_000,
  });

  async function login(email: string, password: string) {
    await loginRequest(email, password);
    setHasToken(true);
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    await queryClient.refetchQueries({ queryKey: ['me'] });
  }

  async function logout() {
    await logoutRequest();
    setHasToken(false);
    queryClient.clear();
  }

  return (
    <AuthContext.Provider
      value={{ me, isLoading: hasToken && isLoading, isAuthenticated: !!me, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
