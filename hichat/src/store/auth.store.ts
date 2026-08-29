import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User } from '../types/user';
import { loginRequest, registerRequest, logoutRequest, meRequest, refreshRequest } from '../api/auth';
import { LoginPayload, RegisterPayload } from '../types/auth';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  cryptoKeys: any | null;
  fingerprint: string;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;

  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
  setCryptoKeys: (keys: any) => void;
  setFingerprint: (print: string) => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      cryptoKeys: null,
      fingerprint: '',
      isAuthenticated: false,
      loading: false,
      error: null,

      login: async (payload) => {
        set({ loading: true, error: null });
        try {
          const response = await loginRequest(payload);
          set({
            user: response.user,
            accessToken: response.accessToken,
            isAuthenticated: true,
            loading: false,
          });
        } catch (err: any) {
          set({
            error: err.response?.data?.error || err.message || 'Login failed',
            loading: false,
          });
          throw err;
        }
      },

      register: async (payload) => {
        set({ loading: true, error: null });
        try {
          const response = await registerRequest(payload);
          set({
            user: response.user,
            accessToken: response.accessToken,
            isAuthenticated: true,
            loading: false,
          });
        } catch (err: any) {
          set({
            error: err.response?.data?.error || err.message || 'Registration failed',
            loading: false,
          });
          throw err;
        }
      },

      logout: async () => {
        set({ loading: true });
        try {
          await logoutRequest();
        } catch (err) {
          console.error('Logout request failed', err);
        } finally {
          set({
            user: null,
            accessToken: null,
            cryptoKeys: null,
            fingerprint: '',
            isAuthenticated: false,
            loading: false,
          });
        }
      },

      checkAuth: async () => {
        set({ loading: true });
        try {
          const response = await meRequest();
          set({
            user: response.user,
            isAuthenticated: true,
            loading: false,
          });
        } catch (err) {
          try {
            await get().refreshSession();
          } catch (refreshErr) {
            set({
              user: null,
              accessToken: null,
              cryptoKeys: null,
              fingerprint: '',
              isAuthenticated: false,
              loading: false,
            });
          }
        }
      },

      refreshSession: async () => {
        try {
          const response = await refreshRequest();
          set({
            user: response.user,
            accessToken: response.accessToken,
            isAuthenticated: true,
            loading: false,
          });
        } catch (err: any) {
          set({
            user: null,
            accessToken: null,
            cryptoKeys: null,
            fingerprint: '',
            isAuthenticated: false,
            loading: false,
          });
          throw err;
        }
      },

      clearError: () => set({ error: null }),
      setCryptoKeys: (keys) => set({ cryptoKeys: keys }),
      setFingerprint: (print) => set({ fingerprint: print }),
      setUser: (user) => set({ user }),
    }),
    {
      name: 'hichat-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        fingerprint: state.fingerprint,
      }),
    }
  )
);
