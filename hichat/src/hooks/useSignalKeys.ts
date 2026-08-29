import { useState, useCallback } from 'react';
import { useAuthStore } from '../store/auth.store';
import {
  loadOrGenerateUserKeys,
  initializeSignalKeys,
  syncSignalKeysIfNeeded,
  SignalProtocolStore,
} from '../services/signal.service';
import {
  getPublicKeyFingerprint,
  computeSafetyNumber,
} from '../services/crypto.service';
import { UserCryptoKeys } from '../types/crypto';

export interface UseSignalKeysReturn {
  cryptoKeys: UserCryptoKeys | null;
  fingerprint: string;
  isInitializing: boolean;
  error: string | null;
  loadOrGenerateKeys: (username: string, deviceId?: number) => Promise<UserCryptoKeys>;
  initializeAndUploadKeys: (username: string, deviceId?: number) => Promise<void>;
  ensureKeysUploaded: (username: string, store?: SignalProtocolStore, deviceId?: number) => Promise<void>;
  getFingerprint: (keyInput: any) => Promise<string>;
  getSafetyNumber: (peerIdentityKey: any) => Promise<string>;
  setCryptoKeys: (keys: UserCryptoKeys | null) => void;
  setFingerprint: (print: string) => void;
}

export function useSignalKeys(): UseSignalKeysReturn {
  const {
    cryptoKeys,
    fingerprint,
    setCryptoKeys,
    setFingerprint,
  } = useAuthStore();

  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load or generate local Signal Protocol keys for a user.
   */
  const loadOrGenerateKeys = useCallback(
    async (username: string, deviceId = 1): Promise<UserCryptoKeys> => {
      setIsInitializing(true);
      setError(null);
      try {
        const keys = await loadOrGenerateUserKeys(username, deviceId);
        setCryptoKeys(keys);
        const print = await getPublicKeyFingerprint(keys.publicKeyJwk);
        setFingerprint(print);
        setIsInitializing(false);
        return keys;
      } catch (err: any) {
        const errMsg = err?.message || 'Failed to load/generate Signal keys';
        setError(errMsg);
        setIsInitializing(false);
        throw err;
      }
    },
    [setCryptoKeys, setFingerprint]
  );

  /**
   * Generate and upload initial Signal PreKey bundle to backend server.
   */
  const initializeAndUploadKeys = useCallback(
    async (username: string, deviceId = 1): Promise<void> => {
      setIsInitializing(true);
      setError(null);
      try {
        await initializeSignalKeys(username, deviceId);
        setIsInitializing(false);
      } catch (err: any) {
        const errMsg = err?.message || 'Failed to initialize and upload Signal keys';
        setError(errMsg);
        setIsInitializing(false);
        throw err;
      }
    },
    []
  );

  /**
   * Check if prekeys are depleted and replenish bundle on backend if needed.
   */
  const ensureKeysUploaded = useCallback(
    async (username: string, store?: SignalProtocolStore, deviceId = 1): Promise<void> => {
      try {
        const targetStore = store || cryptoKeys?.store || new SignalProtocolStore(username);
        await syncSignalKeysIfNeeded(username, targetStore, deviceId);
      } catch (err: any) {
        console.warn('PreKey replenishment warning:', err);
      }
    },
    [cryptoKeys?.store]
  );

  /**
   * Get SHA-256 fingerprint for a public key.
   */
  const getFingerprint = useCallback(async (keyInput: any): Promise<string> => {
    return getPublicKeyFingerprint(keyInput);
  }, []);

  /**
   * Compute 60-digit / 8-block safety number between current user and a peer.
   */
  const getSafetyNumber = useCallback(
    async (peerIdentityKey: any): Promise<string> => {
      if (!cryptoKeys?.identityKey) {
        throw new Error('Local identity key not initialized');
      }
      return computeSafetyNumber(cryptoKeys.identityKey, peerIdentityKey);
    },
    [cryptoKeys?.identityKey]
  );

  return {
    cryptoKeys,
    fingerprint,
    isInitializing,
    error,
    loadOrGenerateKeys,
    initializeAndUploadKeys,
    ensureKeysUploaded,
    getFingerprint,
    getSafetyNumber,
    setCryptoKeys,
    setFingerprint,
  };
}
