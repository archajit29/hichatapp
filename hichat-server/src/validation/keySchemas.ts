import { z } from "zod";
import { idSchema, deviceIdSchema } from "./commonSchemas";

const preKeyItemSchema = z
  .object({
    keyId: z
      .coerce
      .number({
        required_error: "keyId is required",
        invalid_type_error: "keyId must be a number",
      })
      .int("keyId must be an integer")
      .nonnegative("keyId must be non-negative"),
    publicKey: z
      .string({
        required_error: "publicKey is required",
        invalid_type_error: "publicKey must be a string",
      })
      .trim()
      .min(1, "publicKey cannot be empty")
      .max(2048, "publicKey cannot exceed 2048 characters"),
  })
  .strict();

const signedPreKeySchema = z
  .object({
    keyId: z
      .coerce
      .number({
        required_error: "signedPreKey keyId is required",
        invalid_type_error: "signedPreKey keyId must be a number",
      })
      .int("keyId must be an integer")
      .nonnegative("keyId must be non-negative"),
    publicKey: z
      .string({
        required_error: "signedPreKey publicKey is required",
        invalid_type_error: "signedPreKey publicKey must be a string",
      })
      .trim()
      .min(1, "signedPreKey publicKey cannot be empty")
      .max(2048, "signedPreKey publicKey cannot exceed 2048 characters"),
    signature: z
      .string({
        required_error: "signedPreKey signature is required",
        invalid_type_error: "signedPreKey signature must be a string",
      })
      .trim()
      .min(1, "signedPreKey signature cannot be empty")
      .max(2048, "signedPreKey signature cannot exceed 2048 characters"),
  })
  .strict();

/**
 * POST /api/keys/bundle Schema
 */
export const uploadKeyBundleSchema = z
  .object({
    deviceId: deviceIdSchema,
    registrationId: z
      .coerce
      .number({
        required_error: "registrationId is required",
        invalid_type_error: "registrationId must be a number",
      })
      .int("registrationId must be an integer")
      .positive("registrationId must be a positive integer"),
    identityKey: z
      .string({
        required_error: "identityKey is required",
        invalid_type_error: "identityKey must be a string",
      })
      .trim()
      .min(1, "identityKey cannot be empty")
      .max(2048, "identityKey cannot exceed 2048 characters"),
    signedPreKey: signedPreKeySchema,
    oneTimePreKeys: z.array(preKeyItemSchema).default([]),
  })
  .strict();

export type UploadKeyBundleInput = z.infer<typeof uploadKeyBundleSchema>;

/**
 * POST /api/keys/prekeys Schema
 */
export const replenishPreKeysSchema = z
  .object({
    deviceId: deviceIdSchema,
    oneTimePreKeys: z
      .array(preKeyItemSchema, {
        required_error: "oneTimePreKeys array is required",
      })
      .min(1, "At least one prekey must be provided"),
  })
  .strict();

export type ReplenishPreKeysInput = z.infer<typeof replenishPreKeysSchema>;

/**
 * GET /api/keys/bundle/:identifier Params Schema
 */
export const getKeyBundleParamsSchema = z
  .object({
    identifier: idSchema,
  })
  .strict();

export type GetKeyBundleParamsInput = z.infer<typeof getKeyBundleParamsSchema>;

/**
 * GET /api/keys/bundle/:identifier Query Schema
 */
export const getKeyBundleQuerySchema = z
  .object({
    deviceId: z
      .coerce
      .number()
      .int("deviceId must be an integer")
      .positive("deviceId must be positive")
      .default(1)
      .optional(),
  })
  .strict();

export type GetKeyBundleQueryInput = z.infer<typeof getKeyBundleQuerySchema>;
