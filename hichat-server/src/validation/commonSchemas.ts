import { z } from "zod";

/**
 * Helper to create trimmed string schemas with length bounds
 */
export function trimmedString(min = 1, max = 255) {
  return z
    .string({
      required_error: "String value is required",
      invalid_type_error: "Value must be a string",
    })
    .trim()
    .min(min, `Minimum length is ${min}`)
    .max(max, `Maximum length is ${max}`);
}

/**
 * Standard Email Schema: trimmed, normalized lowercase, valid email format
 */
export const emailSchema = z
  .string({
    required_error: "Email is required",
    invalid_type_error: "Email must be a string",
  })
  .trim()
  .toLowerCase()
  .min(1, "Email cannot be empty")
  .max(255, "Email cannot exceed 255 characters")
  .email("Invalid email format");

/**
 * Standard Username Schema: alphanumeric with underscores, 3-30 chars
 */
export const usernameSchema = z
  .string({
    required_error: "Username is required",
    invalid_type_error: "Username must be a string",
  })
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username cannot exceed 30 characters")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Username can only contain alphanumeric characters and underscores"
  );

/**
 * Standard Password Schema: 8-128 chars
 */
export const passwordSchema = z
  .string({
    required_error: "Password is required",
    invalid_type_error: "Password must be a string",
  })
  .min(8, "Minimum length is 8")
  .max(128, "Password cannot exceed 128 characters");

/**
 * Standard UUID Schema
 */
export const uuidSchema = z
  .string({
    required_error: "UUID is required",
    invalid_type_error: "UUID must be a string",
  })
  .trim()
  .uuid("Invalid UUID format");

/**
 * Standard Generic ID Schema (UUIDs, custom string IDs like 'usr_...', 'sock_...')
 */
export const idSchema = z
  .string({
    required_error: "ID is required",
    invalid_type_error: "ID must be a string",
  })
  .trim()
  .min(1, "ID cannot be empty")
  .max(128, "ID cannot exceed 128 characters");

/**
 * Standard Message ID Schema
 */
export const messageIdSchema = z
  .string({
    required_error: "Message ID is required",
    invalid_type_error: "Message ID must be a string",
  })
  .trim()
  .min(1, "Message ID cannot be empty")
  .max(128, "Message ID cannot exceed 128 characters");

/**
 * Standard Ciphertext Schema: encrypted payload
 */
export const ciphertextSchema = z
  .string({
    required_error: "Ciphertext is required",
    invalid_type_error: "Ciphertext must be a string",
  })
  .trim()
  .min(1, "Ciphertext cannot be empty")
  .max(65536, "Ciphertext cannot exceed 65536 characters");

/**
 * Device ID Schema: positive integer
 */
export const deviceIdSchema = z
  .coerce
  .number({
    invalid_type_error: "Device ID must be a number",
  })
  .int("Device ID must be an integer")
  .positive("Device ID must be a positive integer")
  .default(1);

/**
 * Pagination Query Schema
 */
export const paginationQuerySchema = z
  .object({
    limit: z
      .coerce
      .number()
      .int("Limit must be an integer")
      .positive("Limit must be positive")
      .max(100, "Limit cannot exceed 100")
      .default(50)
      .optional(),
    offset: z
      .coerce
      .number()
      .int("Offset must be an integer")
      .nonnegative("Offset cannot be negative")
      .default(0)
      .optional(),
    before: z.string().trim().max(128).optional(),
    after: z.string().trim().max(128).optional(),
  })
  .strict();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
