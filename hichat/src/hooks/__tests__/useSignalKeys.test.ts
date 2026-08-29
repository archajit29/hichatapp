import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSignalKeys } from '../useSignalKeys';
import { useAuthStore } from '../../store/auth.store';
import * as signalService from '../../services/signal.service';
import * as cryptoService from '../../services/crypto.service';

vi.mock('../../services/signal.service', () => ({
  loadOrGenerateUserKeys: vi.fn(),
  initializeUserSignalKeys: vi.fn(),
  syncKeyBundleWithBackend: vi.fn(),
}));

vi.mock('../../services/crypto.service', () => ({
  getKeyFingerprint: vi.fn(),
  generateSafetyNumber: vi.fn(),
}));

describe('useSignalKeys hook', () => {
  beforeEach(() => {
    useAuthStore.setState({
      cryptoKeys: null,
      fingerprint: '',
    });
    vi.clearAllMocks();
  });

  it('loads and generates user keys and sets fingerprint in store', async () => {
    const mockKeys = {
      store: {} as any,
      identityKeyPair: {} as any,
      registrationId: 12345,
      publicKeyJwk: { crv: 'P-256' },
    };

    (signalService.loadOrGenerateUserKeys as any).mockResolvedValueOnce(mockKeys);
    (cryptoService.getKeyFingerprint as any).mockResolvedValueOnce('0xFA39C81');

    const { result } = renderHook(() => useSignalKeys());

    let generated: any;
    await act(async () => {
      generated = await result.current.loadOrGenerateKeys('alice');
    });

    expect(generated).toEqual(mockKeys);
    expect(useAuthStore.getState().cryptoKeys).toEqual(mockKeys);
    expect(useAuthStore.getState().fingerprint).toBe('0xFA39C81');
    expect(result.current.isInitializing).toBe(false);
  });

  it('synchronizes key bundle with backend via ensureKeysUploaded', async () => {
    const mockStore: any = {};
    (signalService.syncKeyBundleWithBackend as any).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useSignalKeys());

    await act(async () => {
      await result.current.ensureKeysUploaded('alice', mockStore, 1);
    });

    expect(signalService.syncKeyBundleWithBackend).toHaveBeenCalledWith('alice', mockStore, 1);
  });

  it('computes fingerprint and safety numbers via service wrappers', async () => {
    (cryptoService.getKeyFingerprint as any).mockResolvedValueOnce('0xFP_TEST');
    (cryptoService.generateSafetyNumber as any).mockResolvedValueOnce('1111-2222');

    const { result } = renderHook(() => useSignalKeys());

    const fp = await result.current.getFingerprint({ k: 'v' });
    const sn = await result.current.getSafetyNumber('key_peer');

    expect(fp).toBe('0xFP_TEST');
    expect(sn).toBe('1111-2222');
  });
});
