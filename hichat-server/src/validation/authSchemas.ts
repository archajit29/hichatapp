import { z } from "zod";
import { emailSchema, usernameSchema, passwordSchema } from "./commonSchemas";

/**
 * POST /api/auth/register Schema
 */
export const registerSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    publicKey: z.string().trim().min(1, "Public key cannot be empty").max(2048).optional(),
    avatarUrl: z.string().trim().url("Invalid avatar URL format").max(1024).optional().nullable(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * POST /api/auth/login Schema
 */
export const loginSchema = z
  .object({
    username: z
      .string({
        required_error: "Username or email is required",
      })
      .trim()
      .min(1, "Username or email is required")
      .max(255, "Username or email cannot exceed 255 characters"),
    password: z
      .string({
        required_error: "Password is required",
      })
      .min(1, "Password is required")
      .max(128, "Password cannot exceed 128 characters"),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * POST /api/auth/refresh Schema
 */
export const refreshSchema = z
  .object({
    refreshToken: z
      .string()
      .trim()
      .min(1, "Refresh token cannot be empty")
      .max(2048)
      .optional(),
  })
  .strict();

export type RefreshInput = z.infer<typeof refreshSchema>;

/**
 * POST /api/auth/logout Schema
 */
export const logoutSchema = z
  .object({
    refreshToken: z
      .string()
      .trim()
      .min(1, "Refresh token cannot be empty")
      .max(2048)
      .optional(),
  })
  .strict();

export type LogoutInput = z.infer<typeof logoutSchema>;

/**
 * POST /api/auth/update-key Schema
 */
export const updateKeySchema = z
  .object({
    publicKey: z
      .string({
        required_error: "Public key is required",
      })
      .trim()
      .min(1, "Public key is required")
      .max(2048, "Public key cannot exceed 2048 characters"),
  })
  .strict();

export type UpdateKeyInput = z.infer<typeof updateKeySchema>;
