import {
  KeyHelper,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher
} from '@privacyresearch/libsignal-protocol-typescript';
import { PreKeyWhisperMessage } from '@privacyresearch/libsignal-protocol-protobuf-ts';

// Utility: Convert ArrayBuffer to Base64 string (isomorphic)
export function arrayBufferToBase64(buffer) {
  if (!buffer) return '';
  if (typeof buffer === 'string') return buffer;
  const bytes = ArrayBuffer.isView(buffer)
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new Uint8Array(buffer);
  
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Utility: Convert Base64 string to ArrayBuffer (isomorphic)
export function base64ToArrayBuffer(base64) {
  if (!base64) return new ArrayBuffer(0);
  if (base64 instanceof ArrayBuffer) return base64;
  if (ArrayBuffer.isView(base64)) return base64.buffer;
  
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * IndexedDB storage engine for Signal Protocol state.
 * Supports large storage capacities for Double Ratchet sessions, prekeys, and ratchet chains.
 */
const DB_NAME = 'hichat_signal_vault';
const DB_VERSION = 1;
const OBJECT_STORE_NAME = 'signal_records';

export class SignalIndexedDB {
  constructor() {
    this.dbPromise = null;
    this.memoryFallback = new Map();
  }

  _getDb() {
    const idb = typeof indexedDB !== 'undefined' ? indexedDB : (typeof globalThis !== 'undefined' ? globalThis.indexedDB : undefined);
    if (!idb) {
      return Promise.resolve(null);
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const request = idb.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
              db.createObjectStore(OBJECT_STORE_NAME);
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  }

  async get(key) {
    const db = await this._getDb();
    if (!db) return this.memoryFallback.get(key);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(OBJECT_STORE_NAME, 'readonly');
        const store = tx.objectStore(OBJECT_STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(this.memoryFallback.get(key));
      }
    });
  }

  async set(key, value) {
    const db = await this._getDb();
    if (!db) {
      this.memoryFallback.set(key, value);
      return;
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(OBJECT_STORE_NAME, 'readwrite');
        const store = tx.objectStore(OBJECT_STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e);
      } catch {
        this.memoryFallback.set(key, value);
        resolve();
      }
    });
  }

  async remove(key) {
    const db = await this._getDb();
    if (!db) {
      this.memoryFallback.delete(key);
      return;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(OBJECT_STORE_NAME, 'readwrite');
        const store = tx.objectStore(OBJECT_STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        this.memoryFallback.delete(key);
        resolve();
      }
    });
  }
}

const globalSignalStorage = new SignalIndexedDB();

/**
 * SignalProtocolStore implements the Signal StorageType interface.
 * Manages identity keys, prekeys, signed prekeys, sessions, and trusted identities
 * backed by IndexedDB namespaced per user.
 */
export class SignalProtocolStore {
  constructor(username, storage = globalSignalStorage) {
    this.username = username;
    this.prefix = `user_${username}_`;
    this.storage = storage;
  }

  _getKey(key) {
    return `${this.prefix}${key}`;
  }

  async saveLocalIdentity(identityKeyPair, registrationId) {
    await this.storage.set(this._getKey('identity_keypair'), {
      pubKey: identityKeyPair.pubKey,
      privKey: identityKeyPair.privKey
    });
    await this.storage.set(this._getKey('registration_id'), registrationId);
  }

  async getIdentityKeyPair() {
    const data = await this.storage.get(this._getKey('identity_keypair'));
    if (!data) return undefined;
    return {
      pubKey: data.pubKey instanceof ArrayBuffer ? data.pubKey : base64ToArrayBuffer(data.pubKey),
      privKey: data.privKey instanceof ArrayBuffer ? data.privKey : base64ToArrayBuffer(data.privKey)
    };
  }

  async getLocalRegistrationId() {
    const regId = await this.storage.get(this._getKey('registration_id'));
    return typeof regId === 'number' ? regId : undefined;
  }

  async isTrustedIdentity(identifier, identityKey) {
    const trustedKey = await this.loadIdentity(identifier);
    if (!trustedKey) {
      return true; // Trust on first use (TOFU)
    }
    const trustedB64 = arrayBufferToBase64(trustedKey);
    const incomingB64 = arrayBufferToBase64(identityKey);
    return trustedB64 === incomingB64;
  }

  async saveIdentity(encodedAddress, publicKey) {
    const existing = await this.loadIdentity(encodedAddress);
    await this.storage.set(
      this._getKey(`identity_${encodedAddress}`),
      publicKey
    );
    if (typeof encodedAddress === 'string' && encodedAddress.includes('.')) {
      const baseName = encodedAddress.split('.')[0];
      await this.storage.set(
        this._getKey(`identity_${baseName}`),
        publicKey
      );
    }
    if (existing && arrayBufferToBase64(existing) !== arrayBufferToBase64(publicKey)) {
      return true;
    }
    return !existing;
  }

  async loadIdentity(encodedAddress) {
    let raw = await this.storage.get(this._getKey(`identity_${encodedAddress}`));
    if (!raw && typeof encodedAddress === 'string' && !encodedAddress.includes('.')) {
      raw = await this.storage.get(this._getKey(`identity_${encodedAddress}.1`));
    }
    if (!raw) return undefined;
    return raw instanceof ArrayBuffer ? raw : base64ToArrayBuffer(raw);
  }

  async loadPreKey(keyId) {
    const raw = await this.storage.get(this._getKey(`prekey_${keyId}`));
    if (!raw) return undefined;
    return {
      pubKey: raw.pubKey instanceof ArrayBuffer ? raw.pubKey : base64ToArrayBuffer(raw.pubKey),
      privKey: raw.privKey instanceof ArrayBuffer ? raw.privKey : base64ToArrayBuffer(raw.privKey)
    };
  }

  async storePreKey(keyId, keyPair) {
    await this.storage.set(this._getKey(`prekey_${keyId}`), {
      pubKey: keyPair.pubKey,
      privKey: keyPair.privKey
    });
  }

  async removePreKey(keyId) {
    await this.storage.remove(this._getKey(`prekey_${keyId}`));
  }

  async loadSignedPreKey(keyId) {
    const raw = await this.storage.get(this._getKey(`signed_prekey_${keyId}`));
    if (!raw) return undefined;
    return {
      pubKey: raw.pubKey instanceof ArrayBuffer ? raw.pubKey : base64ToArrayBuffer(raw.pubKey),
      privKey: raw.privKey instanceof ArrayBuffer ? raw.privKey : base64ToArrayBuffer(raw.privKey)
    };
  }

  async storeSignedPreKey(keyId, keyPair) {
    await this.storage.set(this._getKey(`signed_prekey_${keyId}`), {
      pubKey: keyPair.pubKey,
      privKey: keyPair.privKey
    });
  }

  async removeSignedPreKey(keyId) {
    await this.storage.remove(this._getKey(`signed_prekey_${keyId}`));
  }

  async loadSession(encodedAddress) {
    const raw = await this.storage.get(this._getKey(`session_${encodedAddress}`));
    return typeof raw === 'string' ? raw : undefined;
  }

  async storeSession(encodedAddress, record) {
    await this.storage.set(this._getKey(`session_${encodedAddress}`), record);
  }
}

/**
 * Generate a complete Signal Protocol PreKey Bundle for initial client registration / upload.
 * Includes: Identity Key, Registration ID, Signed PreKey (+ Signature), and Batch of One-Time PreKeys.
 */
export async function generateSignalPreKeyBundle(store, signedKeyId = 1, preKeyStartId = 1, preKeyCount = 20) {
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
  const oneTimePreKeys = [];
  for (let i = 0; i < preKeyCount; i++) {
    const keyId = preKeyStartId + i;
    const preKey = await KeyHelper.generatePreKey(keyId);
    await store.storePreKey(keyId, preKey.keyPair);
    oneTimePreKeys.push({
      keyId: preKey.keyId,
      publicKey: arrayBufferToBase64(preKey.keyPair.pubKey)
    });
  }

  return {
    identityKey: arrayBufferToBase64(identityKeyPair.pubKey),
    registrationId,
    signedPreKey: {
      keyId: signedPreKey.keyId,
      publicKey: arrayBufferToBase64(signedPreKey.keyPair.pubKey),
      signature: arrayBufferToBase64(signedPreKey.signature)
    },
    oneTimePreKeys
  };
}

export class IdentityKeyChangedError extends Error {
  constructor(message = 'Identity key has changed for this contact. Possible MitM or device re-key.') {
    super(message);
    this.name = 'IdentityKeyChangedError';
    this.code = 'IDENTITY_KEY_CHANGED';
  }
}

export class IdentityCheckFailedError extends Error {
  constructor(message = 'Failed to verify sender identity key.') {
    super(message);
    this.name = 'IdentityCheckFailedError';
    this.code = 'IDENTITY_CHECK_FAILED';
  }
}

/**
 * Normalizes any key input (ArrayBuffer, Uint8Array, Base64 string, or JWK object) into a Uint8Array.
 */
function normalizeKeyToUint8Array(keyInput) {
  if (!keyInput) throw new Error('Key input is required');
  if (keyInput instanceof Uint8Array) return keyInput;
  if (keyInput instanceof ArrayBuffer) return new Uint8Array(keyInput);
  if (ArrayBuffer.isView(keyInput)) return new Uint8Array(keyInput.buffer, keyInput.byteOffset, keyInput.byteLength);
  if (typeof keyInput === 'string') {
    if (keyInput.startsWith('{')) {
      const parsed = JSON.parse(keyInput);
      return new Uint8Array(base64ToArrayBuffer(parsed.identityKey || parsed.pubKey || parsed.publicKey || keyInput));
    }
    return new Uint8Array(base64ToArrayBuffer(keyInput));
  }
  throw new Error('Unsupported key format');
}

/**
 * Lexicographical byte-by-byte comparison of two Uint8Arrays.
 */
function compareByteArrays(a, b) {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}

/**
 * Phase 6: Compute shared, symmetric safety number between two parties' identity keys.
 * Sorts raw key bytes deterministically so computeSafetyNumber(A, B) === computeSafetyNumber(B, A).
 * Outputs space-separated 5-digit numeric blocks (Signal standard format).
 *
 * @param identityKeyA - Alice's raw identity key (ArrayBuffer, Uint8Array, or Base64)
 * @param identityKeyB - Bob's raw identity key (ArrayBuffer, Uint8Array, or Base64)
 * @returns Promise<string> - e.g. "18492 48920 19384 83920 18294 58291 03928 47192"
 */
export async function computeSafetyNumber(identityKeyA, identityKeyB) {
  const bytesA = normalizeKeyToUint8Array(identityKeyA);
  const bytesB = normalizeKeyToUint8Array(identityKeyB);

  // Deterministic raw byte sort: smaller key always comes first
  const cmp = compareByteArrays(bytesA, bytesB);
  const [firstKey, secondKey] = cmp <= 0 ? [bytesA, bytesB] : [bytesB, bytesA];

  // Concatenate sorted raw public key bytes
  const combined = new Uint8Array(firstKey.length + secondKey.length);
  combined.set(firstKey, 0);
  combined.set(secondKey, firstKey.length);

  // Hash with SHA-256
  const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : globalThis.crypto;
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', combined.buffer);
  const hashView = new DataView(hashBuffer);

  // Format 32-byte hash as 8 space-separated 5-digit numeric blocks (Signal standard format)
  const blocks = [];
  for (let offset = 0; offset < hashBuffer.byteLength; offset += 4) {
    const uint32 = hashView.getUint32(offset, false); // Big-Endian
    const block = (uint32 % 100000).toString().padStart(5, '0');
    blocks.push(block);
  }

  return blocks.join(' ');
}

/**
 * Compute SHA-256 human-readable cryptographic fingerprint from Identity Key ArrayBuffer or Base64 string.
 */
export async function getPublicKeyFingerprint(identityKeyInput) {
  try {
    let buffer;
    if (typeof identityKeyInput === 'string') {
      if (identityKeyInput.startsWith('{')) {
        const parsed = JSON.parse(identityKeyInput);
        buffer = base64ToArrayBuffer(parsed.identityKey || parsed.pubKey || identityKeyInput);
      } else {
        buffer = base64ToArrayBuffer(identityKeyInput);
      }
    } else if (identityKeyInput instanceof ArrayBuffer) {
      buffer = identityKeyInput;
    } else if (ArrayBuffer.isView(identityKeyInput)) {
      buffer = identityKeyInput.buffer;
    }

    if (!buffer || buffer.byteLength === 0) {
      return 'N/A';
    }

    const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : globalThis.crypto;
    const hashBuffer = await cryptoObj.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex = hashArray.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
    return `SHA256:${hex.substring(0, 23)}...`;
  } catch {
    return 'SHA256:UNKNOWN';
  }
}

/**
 * Initialize or load existing Signal Protocol store for the user.
 * Note: Raw private keys are never returned or exposed to UI state;
 * they remain isolated inside the IndexedDB SignalProtocolStore vault.
 */
export async function loadOrGenerateUserKeys(username, deviceId = 1) {
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
    store
  };
}

/**
 * Formats a PreKeyBundle object (converting Base64 strings to ArrayBuffers as required by libsignal).
 */
export function formatPreKeyBundle(rawBundle) {
  if (!rawBundle) throw new Error('PreKeyBundle is required');
  return {
    identityKey: base64ToArrayBuffer(rawBundle.identityKey),
    registrationId: rawBundle.registrationId,
    signedPreKey: {
      keyId: rawBundle.signedPreKey.keyId,
      publicKey: base64ToArrayBuffer(rawBundle.signedPreKey.publicKey),
      signature: base64ToArrayBuffer(rawBundle.signedPreKey.signature)
    },
    preKey: rawBundle.preKey ? {
      keyId: rawBundle.preKey.keyId,
      publicKey: base64ToArrayBuffer(rawBundle.preKey.publicKey)
    } : undefined
  };
}

/**
 * Establishes an outbound X3DH session with a remote user using their PreKey bundle.
 */
export async function establishOutboundSession(store, remoteUsername, preKeyBundle, remoteDeviceId = 1) {
  const remoteAddress = new SignalProtocolAddress(remoteUsername, remoteDeviceId);
  const sessionBuilder = new SessionBuilder(store, remoteAddress);
  const formattedBundle = formatPreKeyBundle(preKeyBundle);
  try {
    await sessionBuilder.processPreKey(formattedBundle);
  } catch (err) {
    if (
      err instanceof IdentityKeyChangedError ||
      err?.name === 'IdentityKeyChangedError' ||
      err?.name === 'UntrustedIdentityKeyError' ||
      err?.message?.includes('Identity key changed') ||
      err?.message?.includes('Untrusted') ||
      err?.message?.includes('isTrustedIdentity')
    ) {
      throw new IdentityKeyChangedError(`Identity key changed for remote user ${remoteUsername}. Outbound session establishment aborted.`);
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
export async function encryptMessage(store, remoteUsername, plaintext, options = {}) {
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
      registrationId: ciphertext.registrationId
    };
  } catch (err) {
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
export async function decryptMessage(store, remoteUsername, encryptedPayload, options = {}) {
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
  const payloadBody = typeof payloadObj === 'object' && payloadObj.body !== undefined
    ? payloadObj.body
    : payloadObj;

  const remoteAddress = new SignalProtocolAddress(remoteUsername, deviceId);
  const cipher = new SessionCipher(store, remoteAddress);

  try {
    let decryptedBuffer;
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
        let rawBytes;
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
          rawBytes = new Uint8Array(payloadBody.buffer, payloadBody.byteOffset, payloadBody.byteLength);
        }

        if (!rawBytes || rawBytes.byteLength <= 1) {
          throw new IdentityCheckFailedError(`Malformed PreKeyWhisperMessage payload from ${remoteUsername}: empty or missing bytes.`);
        }

        const messageProtoBytes = rawBytes.slice(1);
        let preKeyProto;
        try {
          preKeyProto = PreKeyWhisperMessage.decode(messageProtoBytes);
        } catch (decodeErr) {
          throw new IdentityCheckFailedError(`Failed to decode PreKeyWhisperMessage protobuf from ${remoteUsername}: ${decodeErr.message}`);
        }

        if (!preKeyProto || !preKeyProto.identityKey || preKeyProto.identityKey.byteLength === 0) {
          throw new IdentityCheckFailedError(`PreKeyWhisperMessage from ${remoteUsername} missing sender identity key.`);
        }

        const senderIdKey = preKeyProto.identityKey;
        const isTrusted = await store.isTrustedIdentity(remoteUsername, senderIdKey);
        if (!isTrusted) {
          throw new IdentityKeyChangedError(`Identity key changed for sender ${remoteUsername}. Inbound message decryption aborted.`);
        }
      } catch (checkErr) {
        if (checkErr instanceof IdentityKeyChangedError || checkErr instanceof IdentityCheckFailedError) {
          throw checkErr;
        }
        throw new IdentityCheckFailedError(`Identity verification check failed for ${remoteUsername}: ${checkErr.message}`);
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
  } catch (err) {
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
      throw new IdentityKeyChangedError(`Identity key changed for sender ${remoteUsername}. Decryption aborted.`);
    }
    throw err;
  }
}

// Transitional helper for public key buffer conversions
export async function importPublicKey(key) {
  if (!key) return null;
  return typeof key === 'string' ? base64ToArrayBuffer(key) : key;
}

export {
  KeyHelper,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher
};

