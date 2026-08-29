import initSignal from "@privacyresearch/libsignal-protocol-typescript";
import {
  signalKeyRepository,
  userRepository,
  SignalKeyRepository,
  UserRepository,
  SignalKeyBundleUpload,
  FetchedPreKeyBundle,
} from "../repositories";
import { ValidationError, NotFoundError, CryptoError } from "../core/errors";
import { logger } from "../core/logger";

let signalInstancePromise: Promise<any> | null = null;
function getSignalInstance() {
  if (!signalInstancePromise) {
    signalInstancePromise = initSignal();
  }
  return signalInstancePromise;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const buf = Buffer.from(b64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export class KeyServiceClass {
  constructor(
    private keyRepo: SignalKeyRepository = signalKeyRepository,
    private userRepo: UserRepository = userRepository
  ) {}

  async verifySignedPreKeySignature(
    identityKeyB64: string,
    signedPreKeyB64: string,
    signatureB64: string
  ): Promise<boolean> {
    try {
      const identityKeyBuf = base64ToArrayBuffer(identityKeyB64);
      const signedPreKeyBuf = base64ToArrayBuffer(signedPreKeyB64);
      const signatureBuf = base64ToArrayBuffer(signatureB64);

      if (identityKeyBuf.byteLength !== 33 && identityKeyBuf.byteLength !== 32) {
        return false;
      }
      if (signedPreKeyBuf.byteLength !== 33 && signedPreKeyBuf.byteLength !== 32) {
        return false;
      }
      if (signatureBuf.byteLength !== 64) {
        return false;
      }

      const signal = await getSignalInstance();
      const rawResult = signal.Curve.verifySignature(identityKeyBuf, signedPreKeyBuf, signatureBuf);
      return rawResult !== false;
    } catch (err) {
      logger.warn({ err }, "Signed prekey cryptographic verification threw error");
      return false;
    }
  }

  async uploadKeyBundle(
    input: SignalKeyBundleUpload,
    options?: { skipSignatureCheck?: boolean }
  ): Promise<{ deviceId: number; remainingPreKeys: number }> {
    const { deviceId = 1, registrationId, identityKey, signedPreKey, oneTimePreKeys = [] } = input;

    if (!registrationId || !identityKey || !signedPreKey || !signedPreKey.publicKey || !signedPreKey.signature) {
      throw new ValidationError("Missing required key bundle parameters (registrationId, identityKey, signedPreKey)");
    }

    if (!options?.skipSignatureCheck) {
      const isSignatureValid = await this.verifySignedPreKeySignature(
        identityKey,
        signedPreKey.publicKey,
        signedPreKey.signature
      );

      if (!isSignatureValid) {
        throw new CryptoError("Invalid signed prekey signature. The signed prekey was not signed by the provided identity key.");
      }
    }

    const saved = await this.keyRepo.saveKeyBundle(input);
    return {
      deviceId,
      remainingPreKeys: saved?.remainingOneTimePreKeys || 0,
    };
  }

  async replenishPreKeys(
    userId: string,
    deviceId = 1,
    oneTimePreKeys: Array<{ keyId: number; publicKey: string }>
  ): Promise<{ count: number; remainingPreKeys: number }> {
    if (!Array.isArray(oneTimePreKeys) || oneTimePreKeys.length === 0) {
      throw new ValidationError("oneTimePreKeys array is required and must not be empty");
    }

    const added = await this.keyRepo.addOneTimePreKeys(userId, deviceId, oneTimePreKeys);
    return {
      count: added?.count || oneTimePreKeys.length,
      remainingPreKeys: added?.remainingOneTimePreKeys || 0,
    };
  }

  async getPreKeyBundle(identifier: string, deviceId = 1): Promise<FetchedPreKeyBundle & { deviceId: number; remainingPreKeys: number }> {
    const targetUser = await this.userRepo.findByIdOrUsername(identifier);
    const targetUserId = targetUser?.id;
    if (!targetUserId) {
      throw new NotFoundError("User not found");
    }

    const bundle = await this.keyRepo.fetchAndConsumePreKeyBundle(targetUserId, deviceId);
    if (!bundle) {
      throw new NotFoundError("No key bundle found for this user/device");
    }

    const remaining = await this.keyRepo.countOneTimePreKeys(targetUserId, deviceId);

    return {
      ...bundle,
      deviceId,
      remainingPreKeys: Number(remaining || 0),
    };
  }

  async getPreKeyCount(identifier: string, deviceId = 1): Promise<{ userId: string; deviceId: number; remainingPreKeys: number }> {
    const targetUser = await this.userRepo.findByIdOrUsername(identifier);
    const targetUserId = targetUser?.id;
    if (!targetUserId) {
      throw new NotFoundError("User not found");
    }

    const count = await this.keyRepo.countOneTimePreKeys(targetUserId, deviceId);
    return {
      userId: targetUserId,
      deviceId,
      remainingPreKeys: Number(count || 0),
    };
  }
}

export const KeyService = new KeyServiceClass();
