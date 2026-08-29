import { User } from './user';

export interface LoginPayload {
  username: string;
  password?: string;
  token?: string; // For social login/fallback if needed
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token: string;
  accessToken: string;
  refreshToken: string;
  csrfToken?: string;
  user: User;
}

export interface RefreshResponse {
  success: boolean;
  message: string;
  token: string;
  accessToken: string;
  refreshToken: string;
  csrfToken?: string;
  user: User;
}

export interface MeResponse {
  success: boolean;
  user: User;
}
