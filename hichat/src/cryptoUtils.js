/**
 * Legacy bridge: Re-exports cryptographic and Signal Protocol services
 * from the modular services architecture (services/crypto.service and services/signal.service).
 */

export {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  SignalIndexedDB,
  globalSignalStorage,
  IdentityKeyChangedError,
  IdentityCheckFailedError,
  computeSafetyNumber,
  getPublicKeyFingerprint,
  importPublicKey,
  cryptoService,
} from './services/crypto.service';

export {
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
  signalService,
  KeyHelper,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
} from './services/signal.service';
