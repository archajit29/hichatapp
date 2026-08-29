import { SignalProtocolStore, generateSignalPreKeyBundle } from '../cryptoUtils';
import { uploadKeysRequest } from './keys';

export const initializeSignalKeys = async (username: string) => {
  try {
    const store = new SignalProtocolStore(username);
    const bundle = await generateSignalPreKeyBundle(store, 1, 1, 20);
    
    await uploadKeysRequest({
      registrationId: bundle.registrationId,
      identityKey: bundle.identityKey,
      signedPreKey: bundle.signedPreKey,
      oneTimePreKeys: bundle.oneTimePreKeys,
      deviceId: 1
    });
    
    console.log('Signal prekey bundle uploaded successfully');
  } catch (err) {
    console.error('Failed to generate/upload Signal prekey bundle:', err);
    throw err;
  }
};
