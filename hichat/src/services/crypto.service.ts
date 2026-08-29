/**
 * Cryptographic Utility & Web Crypto Core Services for HiChat
 * Provides low-level encoding, hashing, IndexedDB storage engine, and safety number generation.
 */

// Custom Cryptographic Error Types
export class IdentityKeyChangedError extends Error {
  code: string;

  constructor(message = 'Identity key has changed for this contact. Possible MitM or device re-key.') {
    super(message);
    this.name = 'IdentityKeyChangedError';
    this.code = 'IDENTITY_KEY_CHANGED';
    Object.setPrototypeOf(this, IdentityKeyChangedError.prototype);
  }
}

export class IdentityCheckFailedError extends Error {
  code: string;

  constructor(message = 'Failed to verify sender identity key.') {
    super(message);
    this.name = 'IdentityCheckFailedError';
    this.code = 'IDENTITY_CHECK_FAILED';
    Object.setPrototypeOf(this, IdentityCheckFailedError.prototype);
  }
}

/**
 * Utility: Convert ArrayBuffer or View to Base64 string (isomorphic).
 */
export function arrayBufferToBase64(buffer: ArrayBuffer | ArrayBufferView | string | null | undefined): string {
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

/**
 * Utility: Convert Base64 string to ArrayBuffer (isomorphic).
 */
export function base64ToArrayBuffer(base64: string | ArrayBuffer | ArrayBufferView | null | undefined): ArrayBuffer {
  if (!base64) return new ArrayBuffer(0);
  if (base64 instanceof ArrayBuffer) return base64;
  if (ArrayBuffer.isView(base64)) return base64.buffer.slice(base64.byteOffset, base64.byteOffset + base64.byteLength);

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
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memoryFallback = new Map<string, any>();

  private _getDb(): Promise<IDBDatabase | null> {
    const idb =
      typeof indexedDB !== 'undefined'
        ? indexedDB
        : typeof globalThis !== 'undefined'
        ? (globalThis as any).indexedDB
        : undefined;

    if (!idb) {
      return Promise.resolve(null);
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const request = idb.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = (e: any) => {
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

  async get<T = any>(key: string): Promise<T | undefined> {
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

  async set(key: string, value: any): Promise<void> {
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

  async remove(key: string): Promise<void> {
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

export const globalSignalStorage = new SignalIndexedDB();

/**
 * Normalizes any key input (ArrayBuffer, Uint8Array, Base64 string, or JWK object) into a Uint8Array.
 */
export function normalizeKeyToUint8Array(keyInput: any): Uint8Array {
  if (!keyInput) throw new Error('Key input is required');
  if (keyInput instanceof Uint8Array) return keyInput;
  if (keyInput instanceof ArrayBuffer) return new Uint8Array(keyInput);
  if (ArrayBuffer.isView(keyInput)) {
    return new Uint8Array(keyInput.buffer, keyInput.byteOffset, keyInput.byteLength);
  }
  if (typeof keyInput === 'string') {
    if (keyInput.startsWith('{')) {
      try {
        const parsed = JSON.parse(keyInput);
        return new Uint8Array(base64ToArrayBuffer(parsed.identityKey || parsed.pubKey || parsed.publicKey || keyInput));
      } catch {
        // Fall through to standard base64 decoding
      }
    }
    return new Uint8Array(base64ToArrayBuffer(keyInput));
  }
  throw new Error('Unsupported key format');
}

/**
 * Lexicographical byte-by-byte comparison of two Uint8Arrays.
 */
export function compareByteArrays(a: Uint8Array, b: Uint8Array): number {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}

/**
 * Compute shared, symmetric safety number between two parties' identity keys.
 * Sorts raw key bytes deterministically so computeSafetyNumber(A, B) === computeSafetyNumber(B, A).
 * Outputs space-separated 5-digit numeric blocks (Signal standard format).
 *
 * @param identityKeyA - Alice's raw identity key (ArrayBuffer, Uint8Array, or Base64)
 * @param identityKeyB - Bob's raw identity key (ArrayBuffer, Uint8Array, or Base64)
 * @returns Promise<string> - e.g. "18492 48920 19384 83920 18294 58291 03928 47192"
 */
export async function computeSafetyNumber(identityKeyA: any, identityKeyB: any): Promise<string> {
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
  const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : (globalThis as any).crypto;
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', combined.buffer);
  const hashView = new DataView(hashBuffer);

  // Format 32-byte hash as 8 space-separated 5-digit numeric blocks (Signal standard format)
  const blocks: string[] = [];
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
export async function getPublicKeyFingerprint(identityKeyInput: any): Promise<string> {
  try {
    let buffer: ArrayBuffer | null = null;
    if (typeof identityKeyInput === 'string') {
      if (identityKeyInput.startsWith('{')) {
        try {
          const parsed = JSON.parse(identityKeyInput);
          buffer = base64ToArrayBuffer(parsed.identityKey || parsed.pubKey || identityKeyInput);
        } catch {
          buffer = base64ToArrayBuffer(identityKeyInput);
        }
      } else {
        buffer = base64ToArrayBuffer(identityKeyInput);
      }
    } else if (identityKeyInput instanceof ArrayBuffer) {
      buffer = identityKeyInput;
    } else if (ArrayBuffer.isView(identityKeyInput)) {
      buffer = identityKeyInput.buffer.slice(
        identityKeyInput.byteOffset,
        identityKeyInput.byteOffset + identityKeyInput.byteLength
      );
    }

    if (!buffer || buffer.byteLength === 0) {
      return 'N/A';
    }

    const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : (globalThis as any).crypto;
    const hashBuffer = await cryptoObj.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex = hashArray.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
    return `SHA256:${hex.substring(0, 23)}...`;
  } catch {
    return 'SHA256:UNKNOWN';
  }
}

/**
 * Transitional helper for public key buffer conversions.
 */
export async function importPublicKey(key: any): Promise<ArrayBuffer | null> {
  if (!key) return null;
  return typeof key === 'string' ? base64ToArrayBuffer(key) : key;
}

export const cryptoService = {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  normalizeKeyToUint8Array,
  compareByteArrays,
  computeSafetyNumber,
  getPublicKeyFingerprint,
  importPublicKey,
  SignalIndexedDB,
  globalSignalStorage,
  IdentityKeyChangedError,
  IdentityCheckFailedError,
};
