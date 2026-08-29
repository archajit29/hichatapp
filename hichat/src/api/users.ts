import { apiClient } from './client';
import { User } from '../types/user';

export const fetchUsersRequest = async (): Promise<{ users: User[] }> => {
  const { data } = await apiClient.get<{ users: User[] }>('/users');
  return data;
};
