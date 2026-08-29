import { apiClient } from './client';
import { AuthResponse, LoginPayload, RegisterPayload, MeResponse, RefreshResponse } from '../types/auth';

export const loginRequest = async (payload: LoginPayload): Promise<AuthResponse> => {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', payload);
  return data;
};

export const registerRequest = async (payload: RegisterPayload): Promise<AuthResponse> => {
  const { data } = await apiClient.post<AuthResponse>('/auth/register', payload);
  return data;
};

export const logoutRequest = async (): Promise<{ success: boolean }> => {
  const { data } = await apiClient.post<{ success: boolean }>('/auth/logout');
  return data;
};

export const meRequest = async (): Promise<MeResponse> => {
  const { data } = await apiClient.get<MeResponse>('/auth/me');
  return data;
};

export const refreshRequest = async (): Promise<RefreshResponse> => {
  const { data } = await apiClient.post<RefreshResponse>('/auth/refresh');
  return data;
};
