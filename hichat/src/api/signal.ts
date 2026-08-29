import { initializeSignalKeys as initializeSignalKeysService } from '../services/signal.service';

export const initializeSignalKeys = async (username: string, deviceId = 1) => {
  return initializeSignalKeysService(username, deviceId);
};
