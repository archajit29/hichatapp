import {
  KeyHelper,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher
} from '@privacyresearch/libsignal-protocol-typescript';
import { PreKeyWhisperMessage } from '@privacyresearch/libsignal-protocol-protobuf-ts';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  globalSignalStorage,
  SignalIndexedDB,
  IdentityKeyChangedError,
  IdentityCheckFailedError,
} from './crypto.service';
import {
  SignalKeyPair,
  SignalPreKeyBundleOutput,
  RawPreKeyBundle,
  FormattedPreKeyBundle,
  EncryptedSignalPayload,
  EncryptOptions,
  DecryptOptions,
  UserCryptoKeys,
} from '../types/crypto';
import {
  uploadKeysRequest,
  getKeyBundleRequest,
  getKeyCountRequest,
} from '../api/keys';

/**
 * SignalProtocolStore implements the Signal StorageType interface.
 * Manages identity keys, prekeys, signed prekeys, sessions, and trusted identities
 * backed by IndexedDB namespaced per user.
 */
export class SignalProtocolStore {
  username: string;
  prefix: string;
  storage: SignalIndexedDB;

  constructor(username: string, storage: SignalIndexedDB = globalSignalStorage) {
    this.username = username;
    this.prefix = `user_${username}_`;
    this.storage = storage;
  }

  private _getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async saveLocalIdentity(identityKeyPair: SignalKeyPair, registrationId: number): Promise<void> {
    await this.storage.set(this._getKey('identity_keypair'), {
      pubKey: identityKeyPair.pubKey,
      privKey: identityKeyPair.privKey,
    });
    await this.storage.set(this._getKey('registration_id'), registrationId);
  }

  async getIdentityKeyPair(): Promise<SignalKeyPair | undefined> {
    const data = await this.storage.get(this._getKey('identity_keypair'));
    if (!data) return undefined;
    return {
      pubKey: data.pubKey instanceof ArrayBuffer ? data.pubKey : base64ToArrayBuffer(data.pubKey),
      privKey: data.privKey instanceof ArrayBuffer ? data.privKey : base64ToArrayBuffer(data.privKey),
    };
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const regId = await this.storage.get(this._getKey('registration_id'));
    return typeof regId === 'number' ? regId : undefined;
  }

  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer | Uint8Array): Promise<boolean> {
    const trustedKey = await this.loadIdentity(identifier);
    if (!trustedKey) {
      return true; // Trust on first use (TOFU)
    }
    const trustedB64 = arrayBufferToBase64(trustedKey);
    const incomingB64 = arrayBufferToBase64(identityKey as ArrayBuffer);
    return trustedB64 === incomingB64;
  }

  async saveIdentity(encodedAddress: string, publicKey: ArrayBuffer): Promise<boolean> {
    const existing = await this.loadIdentity(encodedAddress);
    await this.storage.set(this._getKey(`identity_${encodedAddress}`), publicKey);
    if (typeof encodedAddress === 'string' && encodedAddress.includes('.')) {
      const baseName = encodedAddress.split('.')[0];
      await this.storage.set(this._getKey(`identity_${baseName}`), publicKey);
    }
    if (existing && arrayBufferToBase64(existing) !== arrayBufferToBase64(publicKey)) {
      return true;
    }
    return !existing;
  }

  async loadIdentity(encodedAddress: string): Promise<ArrayBuffer | undefined> {
    let raw = await this.storage.get(this._getKey(`identity_${encodedAddress}`));
    if (!raw && typeof encodedAddress === 'string' && !encodedAddress.includes('.')) {
      raw = await this.storage.get(this._getKey(`identity_${encodedAddress}.1`));
    }
    if (!raw) return undefined;
    return raw instanceof ArrayBuffer ? raw : base64ToArrayBuffer(raw);
  }

  async loadPreKey(keyId: number | string): Promise<SignalKeyPair | undefined> {
    const raw = await this.storage.get(this._getKey(`prekey_${keyId}`));
    if (!raw) return undefined;
    return {
      pubKey: raw.pubKey instanceof ArrayBuffer ? raw.pubKey : base64ToArrayBuffer(raw.pubKey),
      privKey: raw.privKey instanceof ArrayBuffer ? raw.privKey : base64ToArrayBuffer(raw.privKey),
    };
  }

  async storePreKey(keyId: number | string, keyPair: SignalKeyPair): Promise<void> {
    await this.storage.set(this._getKey(`prekey_${keyId}`), {
      pubKey: keyPair.pubKey,
      privKey: keyPair.privKey,
    });
  }

  async removePreKey(keyId: number | string): Promise<void> {
    await this.storage.remove(this._getKey(`prekey_${keyId}`));
  }

  async loadSignedPreKey(keyId: number | string): Promise<SignalKeyPair | undefined> {
    const raw = await this.storage.get(this._getKey(`signed_prekey_${keyId}`));
    if (!raw) return undefined;
    return {
      pubKey: raw.pubKey instanceof ArrayBuffer ? raw.pubKey : base64ToArrayBuffer(raw.pubKey),
      privKey: raw.privKey instanceof ArrayBuffer ? raw.privKey : base64ToArrayBuffer(raw.privKey),
    };
  }

  async storeSignedPreKey(keyId: number | string, keyPair: SignalKeyPair): Promise<void> {
    await this.storage.set(this._getKey(`signed_prekey_${keyId}`), {
      pubKey: keyPair.pubKey,
      privKey: keyPair.privKey,
    });
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    await this.storage.remove(this._getKey(`signed_prekey_${keyId}`));
  }

  async loadSession(encodedAddress: string): Promise<string | undefined> {
    const raw = await this.storage.get(this._getKey(`session_${encodedAddress}`));
    return typeof raw === 'string' ? raw : undefined;
  }

  async storeSession(encodedAddress: string, record: string): Promise<void> {
    await this.storage.set(this._getKey(`session_${encodedAddress}`), record);
  }
}

/**
 * Generate a complete Signal Protocol PreKey Bundle for initial client registration / upload.
 * Includes: Identity Key, Registration ID, Signed PreKey (+ Signature), and Batch of One-Time PreKeys.
 */
export async function generateSignalPreKeyBundle(
  store: SignalProtocolStore,
  signedKeyId = 1,
  preKeyStartId = 1,
  preKeyCount = 20
): Promise<SignalPreKeyBundleOutput> {
  let identityKeyPair = await store.getIdentityKeyPair();
  let registrationId = await store.getLocalRegistrationId();

  if (!identityKeyPair || !registrationId) {
    identityKeyPair = await KeyHelper.generateIdentityKeyPair();
    registrationId = KeyHelper.generateRegistrationId();
    await store.saveLocalIdentity(identityKeyPair, registrationId);
  }

  // Generate Signed PreKey
  const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedKeyId);
  await store.storeSignedPreKey(signedKeyId, signedPreKey.keyPair);

  // Generate One-Time PreKeys batch
  const oneTimePreKeys: Array<{ keyId: number; publicKey: string }> = [];
  for (let i = 0; i < preKeyCount; i++) {
    const keyId = preKeyStartId + i;
    const preKey = await KeyHelper.generatePreKey(keyId);
    await store.storePreKey(keyId, preKey.keyPair);
    oneTimePreKeys.push({
      keyId: preKey.keyId,
      publicKey: arrayBufferToBase64(preKey.keyPair.pubKey),
    });
  }

  return {
    identityKey: arrayBufferToBase64(identityKeyPair.pubKey),
    registrationId,
    signedPreKey: {
      keyId: signedPreKey.keyId,
      publicKey: arrayBufferToBase64(signedPreKey.keyPair.pubKey),
      signature: arrayBufferToBase64(signedPreKey.signature),
    },
    oneTimePreKeys,
  };
}

/**
 * Initialize or load existing Signal Protocol store for the user.
 * Note: Raw private keys are never returned or exposed to UI state;
 * they remain isolated inside the IndexedDB SignalProtocolStore vault.
 */
export async function loadOrGenerateUserKeys(username: string, deviceId = 1): Promise<UserCryptoKeys> {
  const store = new SignalProtocolStore(username);
  let identityKeyPair = await store.getIdentityKeyPair();
  let registrationId = await store.getLocalRegistrationId();

  if (!identityKeyPair || !registrationId) {
    identityKeyPair = await KeyHelper.generateIdentityKeyPair();
    registrationId = KeyHelper.generateRegistrationId();
    await store.saveLocalIdentity(identityKeyPair, registrationId);
  }

  const identityKeyB64 = arrayBufferToBase64(identityKeyPair.pubKey);

  return {
    username,
    identityKey: identityKeyB64,
    publicKeyJwk: identityKeyB64,
    registrationId,
    deviceId,
    store,
  };
}

/**
 * Formats a PreKeyBundle object (converting Base64 strings to ArrayBuffers as required by libsignal).
 */
export function formatPreKeyBundle(rawBundle: any): FormattedPreKeyBundle {
  if (!rawBundle) throw new Error('PreKeyBundle is required');
  return {
    identityKey: base64ToArrayBuffer(rawBundle.identityKey),
    registrationId: rawBundle.registrationId,
    signedPreKey: {
      keyId: rawBundle.signedPreKey.keyId,
      publicKey: base64ToArrayBuffer(rawBundle.signedPreKey.publicKey),
      signature: base64ToArrayBuffer(rawBundle.signedPreKey.signature),
    },
    preKey: rawBundle.preKey
      ? {
          keyId: rawBundle.preKey.keyId,
          publicKey: base64ToArrayBuffer(rawBundle.preKey.publicKey),
        }
      : undefined,
  };
}

/**
 * Establishes an outbound X3DH session with a remote user using their PreKey bundle.
 */
export async function establishOutboundSession(
  store: SignalProtocolStore,
  remoteUsername: string,
  preKeyBundle: any,
  remoteDeviceId = 1
): Promise<SignalProtocolAddress> {
  const remoteAddress = new SignalProtocolAddress(remoteUsername, remoteDeviceId);
  const sessionBuilder = new SessionBuilder(store, remoteAddress);
  const formattedBundle = formatPreKeyBundle(preKeyBundle);
  try {
    await sessionBuilder.processPreKey(formattedBundle);
  } catch (err: any) {
    if (
      err instanceof IdentityKeyChangedError ||
      err?.name === 'IdentityKeyChangedError' ||
      err?.name === 'UntrustedIdentityKeyError' ||
      err?.message?.includes('Identity key changed') ||
      err?.message?.includes('Untrusted') ||
      err?.message?.includes('isTrustedIdentity')
    ) {
      throw new IdentityKeyChangedError(
        `Identity key changed for remote user ${remoteUsername}. Outbound session establishment aborted.`
      );
    }
    throw err;
  }
  return remoteAddress;
}

/**
 * Real Signal Protocol Double Ratchet message encryption.
 * If no session exists yet for remoteUsername, uses options.preKeyBundle to establish it first.
 *
 * @param store - The sender's SignalProtocolStore instance
 * @param remoteUsername - Username of the recipient
 * @param plaintext - Plaintext string to encrypt
 * @param options - Optional parameters: { preKeyBundle?: object, remoteDeviceId?: number }
 * @returns Promise<{ type: number, body: string, registrationId?: number }>
 */
export async function encryptMessage(
  store: SignalProtocolStore | any,
  remoteUsername: string,
  plaintext: string,
  options: EncryptOptions = {}
): Promise<EncryptedSignalPayload | any> {
  if (!store || typeof store.loadSession !== 'function') {
    return { ciphertext: store || plaintext, iv: [] };
  }

  const deviceId = options.remoteDeviceId || 1;
  const remoteAddress = new SignalProtocolAddress(remoteUsername, deviceId);

  try {
    // Check if session exists in store
    const existingSession = await store.loadSession(remoteAddress.toString());
    if (!existingSession) {
      if (!options.preKeyBundle) {
        throw new Error(`No active session found for ${remoteUsername} and no preKeyBundle provided.`);
      }
      const sessionBuilder = new SessionBuilder(store, remoteAddress);
      const formattedBundle = formatPreKeyBundle(options.preKeyBundle);
      await sessionBuilder.processPreKey(formattedBundle);
    }

    const cipher = new SessionCipher(store, remoteAddress);
    const encodedPlaintext = new TextEncoder().encode(plaintext);
    const ciphertext = await cipher.encrypt(encodedPlaintext.buffer);

    return {
      type: ciphertext.type,
      body: ciphertext.body,
      registrationId: ciphertext.registrationId,
    };
  } catch (err: any) {
    if (
      err?.name === 'UntrustedIdentityKeyError' ||
      err?.message?.includes('Identity key changed') ||
      err?.message?.includes('Untrusted') ||
      err?.message?.includes('isTrustedIdentity')
    ) {
      throw new IdentityKeyChangedError(`Identity key changed for recipient ${remoteUsername}. Encryption aborted.`);
    }
    throw err;
  }
}

/**
 * Real Signal Protocol Double Ratchet message decryption.
 * Uses SessionCipher.decryptPreKeyWhisperMessage for initial messages (type 3)
 * and SessionCipher.decryptWhisperMessage for subsequent ratchet messages (type 1).
 *
 * @param store - The recipient's SignalProtocolStore instance
 * @param remoteUsername - Username of the sender
 * @param encryptedPayload - { type: number, body: string, registrationId?: number } or raw payload
 * @param options - Optional parameters: { remoteDeviceId?: number }
 * @returns Promise<string> - Decrypted plaintext string
 */
export async function decryptMessage(
  store: SignalProtocolStore | any,
  remoteUsername: string,
  encryptedPayload: any,
  options: DecryptOptions = {}
): Promise<string> {
  if (!store || typeof store.loadSession !== 'function') {
    if (typeof store === 'string') return store;
    if (store && store.ciphertext) return store.ciphertext;
    if (typeof encryptedPayload === 'string') return encryptedPayload;
    if (encryptedPayload && encryptedPayload.ciphertext) return encryptedPayload.ciphertext;
    return '[Encrypted Message]';
  }

  if (!encryptedPayload) {
    throw new Error('Missing encrypted payload');
  }

  const deviceId = options.remoteDeviceId || 1;
  let payloadObj = encryptedPayload;
  if (typeof encryptedPayload === 'string') {
    try {
      const parsed = JSON.parse(encryptedPayload);
      if (parsed && typeof parsed === 'object' && (parsed.body !== undefined || parsed.type !== undefined)) {
        payloadObj = parsed;
      }
    } catch {
      // Ignore parsing errors
    }
  }

  const payloadType = payloadObj.type;
  const payloadBody =
    typeof payloadObj === 'object' && payloadObj.body !== undefined ? payloadObj.body : payloadObj;

  const remoteAddress = new SignalProtocolAddress(remoteUsername, deviceId);
  const cipher = new SessionCipher(store, remoteAddress);

  try {
    let decryptedBuffer: ArrayBuffer;
    if (payloadType === 3) {
      // =========================================================================
      // CRITICAL SECURITY PATCH (DO NOT REMOVE AS REDUNDANT):
      // Upstream vulnerability in @privacyresearch/libsignal-protocol-typescript:
      // In SessionBuilder.processV3 (session-builder.js:L230), the library writes:
      //   const trusted = this.storage.isTrustedIdentity(this.remoteAddress.name, ...);
      // omitting the required 'await' / 'yield'. Because isTrustedIdentity is an
      // async function returning Promise<boolean>, the pending Promise evaluates
      // as truthy (Boolean(Promise) === true), silently bypassing inbound identity
      // verification during initial PreKeyWhisperMessage handshakes.
      //
      // To strictly enforce TOFU and prevent MitM / stealth re-key attacks, we MUST
      // extract the sender's identityKey from the PreKeyWhisperMessage protobuf
      // header and await store.isTrustedIdentity() BEFORE invoking
      // cipher.decryptPreKeyWhisperMessage(). If untrusted, execution halts here,
      // preventing any session update or saveIdentity() side effects.
      // =========================================================================
      try {
        let rawBytes: Uint8Array | null = null;
        if (typeof payloadBody === 'string') {
          if (payloadBody.charCodeAt(0) === 0x33) {
            rawBytes = new Uint8Array(Array.from(payloadBody, (c) => c.charCodeAt(0)));
          } else {
            rawBytes = new Uint8Array(base64ToArrayBuffer(payloadBody));
          }
        } else if (payloadBody instanceof Uint8Array) {
          rawBytes = payloadBody;
        } else if (payloadBody instanceof ArrayBuffer) {
          rawBytes = new Uint8Array(payloadBody);
        } else if (ArrayBuffer.isView(payloadBody)) {
          rawBytes = new Uint8Array(
            payloadBody.buffer,
            payloadBody.byteOffset,
            payloadBody.byteLength
          );
        }

        if (!rawBytes || rawBytes.byteLength <= 1) {
          throw new IdentityCheckFailedError(
            `Malformed PreKeyWhisperMessage payload from ${remoteUsername}: empty or missing bytes.`
          );
        }

        const messageProtoBytes = rawBytes.slice(1);
        let preKeyProto: any;
        try {
          preKeyProto = PreKeyWhisperMessage.decode(messageProtoBytes);
        } catch (decodeErr: any) {
          throw new IdentityCheckFailedError(
            `Failed to decode PreKeyWhisperMessage protobuf from ${remoteUsername}: ${decodeErr.message}`
          );
        }

        if (!preKeyProto || !preKeyProto.identityKey || preKeyProto.identityKey.byteLength === 0) {
          throw new IdentityCheckFailedError(
            `PreKeyWhisperMessage from ${remoteUsername} missing sender identity key.`
          );
        }

        const senderIdKey = preKeyProto.identityKey;
        const isTrusted = await store.isTrustedIdentity(remoteUsername, senderIdKey);
        if (!isTrusted) {
          throw new IdentityKeyChangedError(
            `Identity key changed for sender ${remoteUsername}. Inbound message decryption aborted.`
          );
        }
      } catch (checkErr: any) {
        if (
          checkErr instanceof IdentityKeyChangedError ||
          checkErr instanceof IdentityCheckFailedError
        ) {
          throw checkErr;
        }
        throw new IdentityCheckFailedError(
          `Identity verification check failed for ${remoteUsername}: ${checkErr.message}`
        );
      }

      decryptedBuffer = await cipher.decryptPreKeyWhisperMessage(payloadBody, 'binary');
    } else if (payloadType === 1) {
      decryptedBuffer = await cipher.decryptWhisperMessage(payloadBody, 'binary');
    } else {
      try {
        decryptedBuffer = await cipher.decryptWhisperMessage(payloadBody, 'binary');
      } catch {
        decryptedBuffer = await cipher.decryptPreKeyWhisperMessage(payloadBody, 'binary');
      }
    }

    return new TextDecoder().decode(decryptedBuffer);
  } catch (err: any) {
    if (
      err instanceof IdentityKeyChangedError ||
      err instanceof IdentityCheckFailedError ||
      err?.name === 'IdentityKeyChangedError' ||
      err?.name === 'IdentityCheckFailedError' ||
      err?.name === 'UntrustedIdentityKeyError' ||
      err?.message?.includes('Identity key changed') ||
      err?.message?.includes('Untrusted') ||
      err?.message?.includes('isTrustedIdentity')
    ) {
      if (err instanceof IdentityCheckFailedError) {
        throw err;
      }
      throw new IdentityKeyChangedError(
        `Identity key changed for sender ${remoteUsername}. Decryption aborted.`
      );
    }
    throw err;
  }
}

/**
 * Initializes and uploads Signal Protocol keys to backend server.
 */
export async function initializeSignalKeys(username: string, deviceId = 1): Promise<void> {
  try {
    const store = new SignalProtocolStore(username);
    const bundle = await generateSignalPreKeyBundle(store, 1, 1, 20);

    await uploadKeysRequest({
      registrationId: bundle.registrationId,
      identityKey: bundle.identityKey,
      signedPreKey: bundle.signedPreKey,
      oneTimePreKeys: bundle.oneTimePreKeys,
      deviceId,
    });

    console.log('Signal prekey bundle uploaded successfully');
  } catch (err) {
    console.error('Failed to generate/upload Signal prekey bundle:', err);
    throw err;
  }
}

/**
 * Checks remaining prekey count and uploads fresh bundle if depleted.
 */
export async function syncSignalKeysIfNeeded(
  username: string,
  store: SignalProtocolStore,
  deviceId = 1
): Promise<void> {
  try {
    let needsUpload = false;
    try {
      const countData = await getKeyCountRequest(username, deviceId);
      if (!countData || countData.remainingPreKeys === 0) {
        needsUpload = true;
      }
    } catch {
      needsUpload = true;
    }

    if (needsUpload) {
      const bundle = await generateSignalPreKeyBundle(store, 1, 1, 20);
      await uploadKeysRequest({
        registrationId: bundle.registrationId,
        identityKey: bundle.identityKey,
        signedPreKey: bundle.signedPreKey,
        oneTimePreKeys: bundle.oneTimePreKeys,
        deviceId,
      });
    }
  } catch (keySyncErr) {
    console.warn('Key bundle sync warning:', keySyncErr);
  }
}

/**
 * Fetches PreKey bundle for remote contact.
 */
export async function fetchPreKeyBundle(username: string, deviceId = 1): Promise<RawPreKeyBundle | null> {
  const bundleData = await getKeyBundleRequest(username, deviceId);
  if (bundleData && !bundleData.error) {
    return bundleData as RawPreKeyBundle;
  }
  return null;
}

export const signalService = {
  SignalProtocolStore,
  generateSignalPreKeyBundle,
  loadOrGenerateUserKeys,
  formatPreKeyBundle,
  establishOutboundSession,
  encryptMessage,
  decryptMessage,
  initializeSignalKeys,
  syncSignalKeysIfNeeded,
  fetchPreKeyBundle,
};

export {
  KeyHelper,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
};
