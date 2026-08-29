import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '../client';
import { useAuthStore } from '../../store/auth.store';

describe('api/client interceptors', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      user: null,
      isAuthenticated: false,
    });
    vi.clearAllMocks();
  });

  it('attaches Authorization header when accessToken exists in auth store', async () => {
    useAuthStore.setState({ accessToken: 'mock_jwt_access_token' });

    // Inspect request interceptor handler directly
    const requestInterceptor: any = (apiClient.interceptors.request as any).handlers[0];
    const config = await requestInterceptor.fulfilled({ headers: {} });

    expect(config.headers.Authorization).toBe('Bearer mock_jwt_access_token');
  });

  it('does not attach Authorization header when accessToken is null', async () => {
    useAuthStore.setState({ accessToken: null });

    const requestInterceptor: any = (apiClient.interceptors.request as any).handlers[0];
    const config = await requestInterceptor.fulfilled({ headers: {} });

    expect(config.headers.Authorization).toBeUndefined();
  });

  it('passes successful responses straight through', async () => {
    const responseInterceptor: any = (apiClient.interceptors.response as any).handlers[0];
    const mockResponse = { data: { status: 'ok' }, status: 200 };

    const result = responseInterceptor.fulfilled(mockResponse);
    expect(result).toEqual(mockResponse);
  });

  it('rejects non-401 errors without triggering session refresh', async () => {
    const responseInterceptor: any = (apiClient.interceptors.response as any).handlers[0];
    const mockError = {
      response: { status: 404, data: { error: 'Not Found' } },
      config: { url: '/messages' },
    };

    await expect(responseInterceptor.rejected(mockError)).rejects.toEqual(mockError);
  });

  it('does not retry if the failed 401 request was /auth/refresh', async () => {
    const responseInterceptor: any = (apiClient.interceptors.response as any).handlers[0];
    const mockError = {
      response: { status: 401, data: { error: 'Token expired' } },
      config: { url: '/auth/refresh' },
    };

    await expect(responseInterceptor.rejected(mockError)).rejects.toEqual(mockError);
  });
});
