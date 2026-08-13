import { useContext } from 'react';

import { AuthContext, type AuthState } from '@/features/auth/AuthContext';

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth は AuthProvider の内側で使ってください');
  }
  return context;
}
