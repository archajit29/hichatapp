import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useAuthStore,
  selectAuthUser,
  selectIsAuthenticated,
  selectAuthLoading,
  selectAuthError,
  selectCryptoKeys,
  selectFingerprint,
} from '../auth.store';
import * as authApi from '../../api/auth';

vi.mock('../../api/auth', () => ({
  loginRequest: vi.fn(),
  registerRequest: vi.fn(),
  logoutRequest: vi.fn(),
  refreshRequest: vi.fn(),
  checkAuthRequest: vi.fn(),
}));

describe('auth.store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      cryptoKeys: null,
      fingerprint: '',
      isAuthenticated: false,
      loading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  it('initializes with default unauthenticated state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('handles successful login', async () => {
    const mockUser = { id: 'u1', username: 'alice', email: 'alice@example.com' };
    (authApi.loginRequest as any).mockResolvedValueOnce({
      user: mockUser,
      accessToken: 'jwt_alice_token',
    });

    await useAuthStore.getState().login({ username: 'alice', password: 'password123' });

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.accessToken).toBe('jwt_alice_token');
    expect(state.isAuthenticated).toBe(true);
    expect(state.loading).toBe(false);
  });

  it('handles login failure and sets error state', async () => {
    (authApi.loginRequest as any).mockRejectedValueOnce({
      response: { data: { error: 'Invalid credentials' } },
    });

    await expect(
      useAuthStore.getState().login({ username: 'alice', password: 'wrong' })
    ).rejects.toBeDefined();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe('Invalid credentials');
  });

  it('handles successful registration', async () => {
    const mockUser = { id: 'u2', username: 'bob', email: 'bob@example.com' };
    (authApi.registerRequest as any).mockResolvedValueOnce({
      user: mockUser,
      accessToken: 'jwt_bob_token',
    });

    await useAuthStore.getState().register({
      username: 'bob',
      email: 'bob@example.com',
      password: 'password123',
    });

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.accessToken).toBe('jwt_bob_token');
    expect(state.isAuthenticated).toBe(true);
  });

  it('handles logout and clears auth state', async () => {
    useAuthStore.setState({
      user: { id: 'u1', username: 'alice', email: 'alice@example.com' },
      accessToken: 'token123',
      isAuthenticated: true,
    });

    (authApi.logoutRequest as any).mockResolvedValueOnce({});
    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('supports setting crypto keys and fingerprint', () => {
    const mockKeys = { store: {} as any, publicKeyJwk: {} as any };
    useAuthStore.getState().setCryptoKeys(mockKeys);
    useAuthStore.getState().setFingerprint('0x123456');

    const state = useAuthStore.getState();
    expect(state.cryptoKeys).toEqual(mockKeys);
    expect(state.fingerprint).toBe('0x123456');
  });

  it('exports accurate granular selector functions', () => {
    const mockUser = { id: 'u3', username: 'charlie', email: 'c@test.com' };
    const mockState = {
      user: mockUser,
      isAuthenticated: true,
      loading: false,
      error: 'Sample Error',
      cryptoKeys: { key: 'test' } as any,
      fingerprint: 'FP_CHARLIE',
    } as any;

    expect(selectAuthUser(mockState)).toEqual(mockUser);
    expect(selectIsAuthenticated(mockState)).toBe(true);
    expect(selectAuthLoading(mockState)).toBe(false);
    expect(selectAuthError(mockState)).toBe('Sample Error');
    expect(selectCryptoKeys(mockState)).toEqual({ key: 'test' });
    expect(selectFingerprint(mockState)).toBe('FP_CHARLIE');
  });
});
