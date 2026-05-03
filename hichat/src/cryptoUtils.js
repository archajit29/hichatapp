// Crypto utilities for HiChat E2EE

/**
 * Generates a new RSA-OAEP key pair for encryption/decryption
 */
export async function generateKeyPair() {
  return await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Exports a public key to a format that can be sent over the wire (JWK)
 */
export async function exportPublicKey(key) {
  return await window.crypto.subtle.exportKey("jwk", key);
}

/**
 * Imports a public key from JWK format
 */
export async function importPublicKey(jwk) {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

/**
 * Encrypts a message string using a public key
 */
export async function encryptMessage(message, publicKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    data
  );
  
  return btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
}

/**
 * Decrypts a base64 encrypted string using a private key
 */
export async function decryptMessage(encryptedBase64, privateKey) {
  const encryptedBuffer = new Uint8Array(
    atob(encryptedBase64)
      .split("")
      .map((c) => c.charCodeAt(0))
  );
  
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    encryptedBuffer
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
