import { useAuthStore } from '../store/auth.store';

export const useAuth = () => {
  const {
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
    } = useAuthStore();

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
