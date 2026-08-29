import { Hono } from "hono";
import { AuthService, KeyService } from "../services";
import { validateBody, validateParams, validateQuery } from "../middleware/validation";
import {
  uploadKeyBundleSchema,
  replenishPreKeysSchema,
  getKeyBundleParamsSchema,
  getKeyBundleQuerySchema,
  UploadKeyBundleInput,
  ReplenishPreKeysInput,
  GetKeyBundleParamsInput,
  GetKeyBundleQueryInput,
} from "../validation";
import { centralizedErrorHandler } from "../middleware/errorHandler";

export const keysRouter = new Hono();
keysRouter.onError(centralizedErrorHandler);

/**
 * POST /api/keys/bundle
 * Uploads initial Signal Protocol bundle.
 */
keysRouter.post("/bundle", validateBody(uploadKeyBundleSchema), async (c) => {
  const authHeader = c.req.header("Authorization");
  const user = await AuthService.getAuthenticatedUser(authHeader);

  const body = c.get("validJson") as UploadKeyBundleInput;
  const { deviceId = 1, registrationId, identityKey, signedPreKey, oneTimePreKeys = [] } = body;

  const result = await KeyService.uploadKeyBundle({
    userId: user.id,
    deviceId,
    registrationId,
    identityKey,
    signedPreKey,
    oneTimePreKeys,
  });

  return c.json({
    success: true,
    message: "Key bundle uploaded successfully",
    deviceId: result.deviceId,
    remainingPreKeys: result.remainingPreKeys,
  });
});

/**
 * POST /api/keys/prekeys
 * Replenishes single-use one-time prekeys.
 */
keysRouter.post("/prekeys", validateBody(replenishPreKeysSchema), async (c) => {
  const authHeader = c.req.header("Authorization");
  const user = await AuthService.getAuthenticatedUser(authHeader);

  const body = c.get("validJson") as ReplenishPreKeysInput;
  const { deviceId = 1, oneTimePreKeys = [] } = body;

  const result = await KeyService.replenishPreKeys(user.id, deviceId, oneTimePreKeys);

  return c.json({
    success: true,
    message: `${result.count} one-time prekeys added`,
    remainingPreKeys: result.remainingPreKeys,
  });
});

/**
 * GET /api/keys/bundle/:identifier
 * Fetches an X3DH PreKeyBundle for initiating a session with the user.
 */
keysRouter.get(
  "/bundle/:identifier",
  validateParams(getKeyBundleParamsSchema),
  validateQuery(getKeyBundleQuerySchema),
  async (c) => {
    const { identifier } = c.get("validParams") as GetKeyBundleParamsInput;
    const query = (c.get("validQuery") || {}) as GetKeyBundleQueryInput;
    const deviceId = query.deviceId || 1;

    const bundle = await KeyService.getPreKeyBundle(identifier, deviceId);

    return c.json({
      identityKey: bundle.identityKey,
      registrationId: bundle.registrationId,
      deviceId: bundle.deviceId,
      signedPreKey: {
        keyId: bundle.signedPreKey.keyId,
        publicKey: bundle.signedPreKey.publicKey,
        signature: bundle.signedPreKey.signature,
      },
      preKey: bundle.oneTimePreKey
        ? {
            keyId: bundle.oneTimePreKey.keyId,
            publicKey: bundle.oneTimePreKey.publicKey,
          }
        : null,
      remainingPreKeys: bundle.remainingPreKeys,
    });
  }
);

/**
 * GET /api/keys/count/:identifier
 * Returns the number of remaining one-time prekeys.
 */
keysRouter.get(
  "/count/:identifier",
  validateParams(getKeyBundleParamsSchema),
  validateQuery(getKeyBundleQuerySchema),
  async (c) => {
    const { identifier } = c.get("validParams") as GetKeyBundleParamsInput;
    const query = (c.get("validQuery") || {}) as GetKeyBundleQueryInput;
    const deviceId = query.deviceId || 1;

    const result = await KeyService.getPreKeyCount(identifier, deviceId);

    return c.json({
      userId: result.userId,
      deviceId: result.deviceId,
      remainingPreKeys: result.remainingPreKeys,
    });
  }
);
