import { useAuthStore } from '../store/auth.store';

export const useAuth = () => {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const cryptoKeys = useAuthStore((state) => state.cryptoKeys);
  const fingerprint = useAuthStore((state) => state.fingerprint);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const logout = useAuthStore((state) => state.logout);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const refreshSession = useAuthStore((state) => state.refreshSession);
  const clearError = useAuthStore((state) => state.clearError);
  const setCryptoKeys = useAuthStore((state) => state.setCryptoKeys);
  const setFingerprint = useAuthStore((state) => state.setFingerprint);
  const setUser = useAuthStore((state) => state.setUser);

  return {
    user,
    accessToken,
    cryptoKeys,
    fingerprint,
    isAuthenticated,
    loading,
    error,
    login,
    register,
    logout,
    checkAuth,
    refreshSession,
    clearError,
    setCryptoKeys,
    setFingerprint,
    setUser,
  };
};
