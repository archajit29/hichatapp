import { useCallback } from 'react';
import { useAuthStore } from '../store/auth.store';
import {
  encryptMessage as signalEncryptMessage,
  decryptMessage as signalDecryptMessage,
  SignalProtocolStore,
} from '../services/signal.service';
import {
  importPublicKey as cryptoImportPublicKey,
  getPublicKeyFingerprint,
  computeSafetyNumber,
} from '../services/crypto.service';
import { getKeyBundleRequest } from '../api/keys';
import { socket } from '../api/socket';
import { Message } from '../types/chat';
import { User } from '../types/user';
import {
  EncryptedSignalPayload,
  EncryptOptions,
  DecryptOptions,
  RecipientTarget,
} from '../types/crypto';

export interface UseEncryptionReturn {
  encryptMessage: (
    remoteUsername: string,
    plaintext: string,
    options?: EncryptOptions & { store?: SignalProtocolStore }
  ) => Promise<EncryptedSignalPayload>;
  decryptMessage: (
    remoteUsername: string,
    encryptedPayload: any,
    options?: DecryptOptions & { store?: SignalProtocolStore }
  ) => Promise<string>;
  encryptForUsers: (
    targetUsers: RecipientTarget[],
    plaintext: string,
    options?: { store?: SignalProtocolStore }
  ) => Promise<Record<string, EncryptedSignalPayload>>;
  decryptChatPayload: (
    msgData: Message,
    authUser: User | null,
    store?: SignalProtocolStore
  ) => Promise<Message>;
  importPublicKey: (key: any) => Promise<ArrayBuffer | null>;
  isSessionActive: (
    remoteUsername: string,
    store?: SignalProtocolStore,
    deviceId?: number
  ) => Promise<boolean>;
  getPublicKeyFingerprint: (keyInput: any) => Promise<string>;
  computeSafetyNumber: (identityKeyA: any, identityKeyB: any) => Promise<string>;
}

export function useEncryption(customStore?: SignalProtocolStore): UseEncryptionReturn {
  const { cryptoKeys } = useAuthStore();
  const getStore = useCallback((): SignalProtocolStore | null => {
    return customStore || cryptoKeys?.store || null;
  }, [customStore, cryptoKeys?.store]);

  /**
   * Encrypt plaintext for a single recipient using Signal Double Ratchet.
   * Automatically establishes an X3DH session using a remote PreKey bundle if none exists.
   */
  const encryptMessage = useCallback(
    async (
      remoteUsername: string,
      plaintext: string,
      options: EncryptOptions & { store?: SignalProtocolStore } = {}
    ): Promise<EncryptedSignalPayload> => {
      const store = options.store || getStore();
      if (!store) {
        throw new Error('Encryption store not initialized');
      }

      const deviceId = options.remoteDeviceId || 1;
      let preKeyBundle = options.preKeyBundle;

      // Check if session already exists
      const session = await store.loadSession(`${remoteUsername}.${deviceId}`);
      if (!session && !preKeyBundle) {
        const bundleData = await getKeyBundleRequest(remoteUsername, deviceId);
        if (bundleData && !bundleData.error) {
          preKeyBundle = bundleData;
        } else {
          throw new Error(`Could not fetch PreKey bundle for recipient ${remoteUsername}`);
        }
      }

      return signalEncryptMessage(store, remoteUsername, plaintext, {
        ...options,
        preKeyBundle,
      });
    },
    [getStore]
  );

  /**
   * Decrypt incoming Double Ratchet ciphertext from a sender.
   */
  const decryptMessage = useCallback(
    async (
      remoteUsername: string,
      encryptedPayload: any,
      options: DecryptOptions & { store?: SignalProtocolStore } = {}
    ): Promise<string> => {
      const store = options.store || getStore();
      if (!store) {
        if (typeof encryptedPayload === 'string') return encryptedPayload;
        if (encryptedPayload?.body) return encryptedPayload.body;
        return '[Encrypted Message]';
      }
      return signalDecryptMessage(store, remoteUsername, encryptedPayload, options);
    },
    [getStore]
  );

  /**
   * Multi-recipient channel message encryption.
   * Encrypts plaintext for each active user in the channel and maps to username, socketId, and userId.
   */
  const encryptForUsers = useCallback(
    async (
      targetUsers: RecipientTarget[],
      plaintext: string,
      options: { store?: SignalProtocolStore } = {}
    ): Promise<Record<string, EncryptedSignalPayload>> => {
      const store = options.store || getStore();
      const payloads: Record<string, EncryptedSignalPayload> = {};
      if (!store) return payloads;

      for (const targetUser of targetUsers) {
        try {
          const deviceId = targetUser.deviceId || 1;
          let enc: EncryptedSignalPayload | null = null;
          const session = await store.loadSession(`${targetUser.username}.${deviceId}`);

          if (!session) {
            const bundleData = await getKeyBundleRequest(targetUser.username, deviceId);
            if (bundleData && !bundleData.error) {
              enc = await signalEncryptMessage(store, targetUser.username, plaintext, {
                preKeyBundle: bundleData,
                remoteDeviceId: deviceId,
              });
            } else {
              console.warn(`Could not fetch PreKey bundle for ${targetUser.username}:`, bundleData?.error);
              continue;
            }
          } else {
            enc = await signalEncryptMessage(store, targetUser.username, plaintext, {
              remoteDeviceId: deviceId,
            });
          }

          if (enc) {
            if (targetUser.username) payloads[targetUser.username] = enc;
            if (targetUser.socketId) payloads[targetUser.socketId] = enc;
            if (targetUser.userId) {
              payloads[targetUser.userId] = enc;
              payloads[String(targetUser.userId)] = enc;
            }
          }
        } catch (err) {
          console.error(`Encryption error for recipient ${targetUser.username}:`, err);
        }
      }

      return payloads;
    },
    [getStore]
  );

  /**
   * Decrypt a room/channel/DM message payload for the current authenticated user.
   */
  const decryptChatPayload = useCallback(
    async (
      msgData: Message,
      authUser: User | null,
      customStoreParam?: SignalProtocolStore
    ): Promise<Message> => {
      if (msgData.isDeleted) {
        return { ...msgData, message: '[This message was deleted]', isDeleted: true };
      }

      try {
        const payloads = msgData.payloads || {};
        const targetCiphertext =
          (authUser?.username && payloads[authUser.username]) ||
          (socket?.id && payloads[socket.id]) ||
          (authUser?.id && payloads[authUser.id]) ||
          (authUser?.id && payloads[String(authUser.id)]) ||
          payloads['all'];

        if (msgData.author === authUser?.username) {
          return { ...msgData, isEncrypted: true, isDecrypted: true };
        }

        if (!targetCiphertext) {
          if (msgData.message) return { ...msgData, isEncrypted: true };
          return { ...msgData, message: '[Encrypted Message]', isEncrypted: true };
        }

        const store = customStoreParam || getStore();
        if (store && msgData.author) {
          const text = await signalDecryptMessage(store, msgData.author, targetCiphertext);
          return { ...msgData, message: text, isEncrypted: true, isDecrypted: true };
        } else if (msgData.message) {
          return { ...msgData, isEncrypted: true };
        } else {
          return { ...msgData, message: '[Encrypted Message]', isEncrypted: true };
        }
      } catch (_err) {
        console.warn(`Decryption error for message from ${msgData.author}:`, _err);
        if (msgData.message) return { ...msgData, isEncrypted: true };
        return { ...msgData, message: '[Encrypted Message]', isEncrypted: true };
      }
    },
    [getStore]
  );

  /**
   * Check if a Double Ratchet session currently exists for a contact.
   */
  const isSessionActive = useCallback(
    async (
      remoteUsername: string,
      customStoreParam?: SignalProtocolStore,
      deviceId = 1
    ): Promise<boolean> => {
      const store = customStoreParam || getStore();
      if (!store) return false;
      const session = await store.loadSession(`${remoteUsername}.${deviceId}`);
      return Boolean(session);
    },
    [getStore]
  );

  return {
    encryptMessage,
    decryptMessage,
    encryptForUsers,
    decryptChatPayload,
    importPublicKey: cryptoImportPublicKey,
    isSessionActive,
    getPublicKeyFingerprint,
    computeSafetyNumber,
  };
}
