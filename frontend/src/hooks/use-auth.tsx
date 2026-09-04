import type { User } from '@voiceops/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { ApiError, tokenStore } from '@/services/api-client';
import { authApi } from '@/services/endpoints';

interface AuthValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    retry: (failureCount, error) =>
      // A 401 just means "not signed in"; retrying it only delays the login screen.
      !(error instanceof ApiError && error.status === 401) && failureCount < 2,
    staleTime: 5 * 60 * 1000,
  });

  const value = React.useMemo<AuthValue>(
    () => ({
      user: data ?? null,
      isLoading,
      login: async (email, password) => {
        const result = await authApi.login({ email, password });
        tokenStore.set(result.token);
        queryClient.setQueryData(['auth', 'me'], result.user);
      },
      logout: async () => {
        await authApi.logout().catch(() => undefined);
        tokenStore.clear();
        queryClient.clear();
      },
    }),
    [data, isLoading, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthValue => {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
