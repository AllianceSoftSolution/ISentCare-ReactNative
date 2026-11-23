import { create } from 'zustand';

export type SessionStatus =
  | 'unknown'
  | 'checking'
  | 'signedOut'
  | 'verified'
  | 'incomplete'
  | 'pending'
  | 'error';

type AuthState = {
  token: string | null;
  sessionStatus: SessionStatus;
  setToken: (token: string | null) => void;
  setSessionStatus: (status: SessionStatus) => void;
  logout: () => void;
};

/** Zustand store. Safe to call `.getState()` outside React; use the hook in components. */
const useAuthStore = create<AuthState>((set) => ({
  token: null,
  sessionStatus: 'unknown',
  setToken: (token) => set({ token }),
  setSessionStatus: (sessionStatus) => set({ sessionStatus }),
  logout: () => set({ token: null, sessionStatus: 'signedOut' }),
}));

/** Non-hook alias for utilities/API modules (avoids “calling a hook” confusion). */
export const authStore = useAuthStore;

export default useAuthStore;
