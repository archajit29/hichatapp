import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEncryption } from '../useEncryption';
import { useAuthStore } from '../../store/auth.store';
import * as signalService from '../../services/signal.service';
import * as cryptoService from '../../services/crypto.service';

vi.mock('../../services/signal.service', () => ({
  encryptMessage: vi.fn(),
  decryptMessage: vi.fn(),
  encryptMessageForRecipients: vi.fn(),
  createSignalProtocolStore: vi.fn(),
}));

vi.mock('../../services/crypto.service', () => ({
  getPublicKeyFingerprint: vi.fn(),
  computeSafetyNumber: vi.fn(),
  importPublicKey: vi.fn(),
}));

describe('useEncryption hook', () => {
  beforeEach(() => {
    useAuthStore.setState({
      cryptoKeys: null,
      user: { id: 'u1', username: 'alice', email: 'alice@example.com' },
    });
    vi.clearAllMocks();
  });

  it('throws error when encryptMessage is called without an initialized store', async () => {
    const { result } = renderHook(() => useEncryption());
    await expect(result.current.encryptMessage('bob', 'secret text')).rejects.toThrow(
      'Encryption store not initialized'
    );
  });

  it('calls encryptMessage when a store is present', async () => {
    const mockStore: any = {
      loadSession: vi.fn().mockResolvedValue('active_session_record'),
    };
    useAuthStore.setState({ cryptoKeys: { store: mockStore } as any });

    const mockCiphertext = { type: 3, body: 'encrypted_data', registrationId: 100 };
    (signalService.encryptMessage as any).mockResolvedValueOnce(mockCiphertext);

    const { result } = renderHook(() => useEncryption());
    const ciphertext = await result.current.encryptMessage('bob', 'secret text');

    expect(ciphertext).toEqual(mockCiphertext);
    expect(signalService.encryptMessage).toHaveBeenCalledWith(
      mockStore,
      'bob',
      'secret text',
      expect.anything()
    );
  });

  it('calls decryptMessage when decrypting ciphertext', async () => {
    const mockStore: any = {
      loadSession: vi.fn().mockResolvedValue('active_session_record'),
    };
    useAuthStore.setState({ cryptoKeys: { store: mockStore } as any });

    (signalService.decryptMessage as any).mockResolvedValueOnce('decrypted plaintext');

    const { result } = renderHook(() => useEncryption());
    const plaintext = await result.current.decryptMessage('bob', { type: 1, body: 'cipher' });

    expect(plaintext).toBe('decrypted plaintext');
    expect(signalService.decryptMessage).toHaveBeenCalledWith(
      mockStore,
      'bob',
      { type: 1, body: 'cipher' },
      expect.anything()
    );
  });

  it('encrypts messages for multiple recipients via encryptForUsers', async () => {
    const mockStore: any = {
      loadSession: vi.fn().mockResolvedValue('active_session_record'),
    };
    useAuthStore.setState({ cryptoKeys: { store: mockStore } as any });

    const mockPayload = { type: 1, body: 'cipher_bob' } as any;
    (signalService.encryptMessage as any).mockResolvedValue(mockPayload);

    const { result } = renderHook(() => useEncryption());
    const payloads = await result.current.encryptForUsers(
      [{ username: 'bob', deviceId: 1 }],
      'hello team'
    );

    expect(payloads).toEqual({ bob: mockPayload });
    expect(signalService.encryptMessage).toHaveBeenCalledWith(
      mockStore,
      'bob',
      'hello team',
      expect.anything()
    );
  });

  it('computes public key fingerprint and safety numbers', async () => {
    (cryptoService.getPublicKeyFingerprint as any).mockResolvedValueOnce('0xABCD1234');
    (cryptoService.computeSafetyNumber as any).mockResolvedValueOnce('12345-67890');

    const { result } = renderHook(() => useEncryption());
    const fingerprint = await result.current.getPublicKeyFingerprint('key_data');
    const safetyNumber = await result.current.computeSafetyNumber('keyA', 'keyB');

    expect(fingerprint).toBe('0xABCD1234');
    expect(safetyNumber).toBe('12345-67890');
  });
});
