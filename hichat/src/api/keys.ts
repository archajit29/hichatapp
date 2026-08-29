import { apiClient } from './client';

export interface KeyBundlePayload {
  registrationId: number;
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: string;
  }>;
  deviceId: number;
}

export const uploadKeysRequest = async (payload: KeyBundlePayload): Promise<{ success: boolean; message?: string }> => {
  const { data } = await apiClient.post<{ success: boolean; message?: string }>('/keys/bundle', payload);
  return data;
};

export const getKeyBundleRequest = async (identifier: string, deviceId: number = 1): Promise<any> => {
  const { data } = await apiClient.get(`/keys/bundle/${encodeURIComponent(identifier)}`, {
    params: { deviceId },
  });
  return data;
};

export const getKeyCountRequest = async (identifier: string, deviceId: number = 1): Promise<{ remainingPreKeys: number; userId?: string; deviceId?: number }> => {
  const { data } = await apiClient.get<{ remainingPreKeys: number; userId?: string; deviceId?: number }>(`/keys/count/${encodeURIComponent(identifier)}`, {
    params: { deviceId },
  });
  return data;
};
