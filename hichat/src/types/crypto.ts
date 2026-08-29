export interface SignalKeyPair {
  pubKey: ArrayBuffer;
  privKey: ArrayBuffer;
}

export interface Base64KeyPair {
  pubKey: string;
  privKey: string;
}

export interface SignedPreKeyRecord {
  keyId: number;
  keyPair: SignalKeyPair;
  signature: ArrayBuffer;
}

export interface FormattedSignedPreKey {
  keyId: number;
  publicKey: ArrayBuffer;
  signature: ArrayBuffer;
}

export interface FormattedPreKey {
  keyId: number;
  publicKey: ArrayBuffer;
}

export interface FormattedPreKeyBundle {
  identityKey: ArrayBuffer;
  registrationId: number;
  signedPreKey: FormattedSignedPreKey;
  preKey?: FormattedPreKey;
}

export interface OneTimePreKeyPayload {
  keyId: number;
  publicKey: string;
}

export interface SignedPreKeyPayload {
  keyId: number;
  publicKey: string;
  signature: string;
}

export interface SignalPreKeyBundleOutput {
  identityKey: string;
  registrationId: number;
  signedPreKey: SignedPreKeyPayload;
  oneTimePreKeys: OneTimePreKeyPayload[];
}

export interface RawPreKeyBundle {
  identityKey: string;
  registrationId: number;
  signedPreKey: SignedPreKeyPayload;
  preKey?: OneTimePreKeyPayload;
  oneTimePreKeys?: OneTimePreKeyPayload[];
}

export interface EncryptedSignalPayload {
  type: number;
  body: string;
  registrationId?: number;
}

export interface EncryptOptions {
  preKeyBundle?: RawPreKeyBundle | null;
  remoteDeviceId?: number;
}

export interface DecryptOptions {
  remoteDeviceId?: number;
}

export interface RecipientTarget {
  username: string;
  userId?: string;
  socketId?: string;
  deviceId?: number;
}

export interface UserCryptoKeys {
  username: string;
  identityKey: string;
  publicKeyJwk: string;
  registrationId: number;
  deviceId: number;
  store: any; // SignalProtocolStore
}
