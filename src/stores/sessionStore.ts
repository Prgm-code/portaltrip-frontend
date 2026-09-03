import type { AuthSession, UserProfile } from 'models/auth';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

export const SESSION_STORAGE_KEY = 'portaltrip-session';

interface SessionState {
  session: AuthSession | null;
  setSession: (session: AuthSession) => void;
  setUser: (user: UserProfile) => void;
  setBalance: (balance: number) => void;
  clearSession: () => void;
}

// La sesión sobrevive a recargas; el token expira solo y `getActiveSession` lo descarta.
export const sessionStore = createStore<SessionState>()(
  persist<SessionState, [], [], Pick<SessionState, 'session'>>(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      setUser: (user) =>
        set((state) => (state.session ? { session: { ...state.session, user } } : {})),
      setBalance: (balance) =>
        set((state) =>
          state.session
            ? { session: { ...state.session, user: { ...state.session.user, balance } } }
            : {},
        ),
      clearSession: () => set({ session: null }),
    }),
    {
      name: SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ session: state.session }),
    },
  ),
);

export function sessionMillisecondsLeft(session: AuthSession | null): number {
  if (!session) return 0;
  return Date.parse(session.expiresAt) - Date.now();
}

/** Sesión vigente o `null`; una sesión vencida se elimina al consultarla. */
export function getActiveSession(): AuthSession | null {
  const { session, clearSession } = sessionStore.getState();
  if (!session) return null;
  if (sessionMillisecondsLeft(session) <= 0) {
    clearSession();
    return null;
  }
  return session;
}

export function isAuthenticated(): boolean {
  return getActiveSession() !== null;
}

export function getCurrentUser(): UserProfile | null {
  return getActiveSession()?.user ?? null;
}
