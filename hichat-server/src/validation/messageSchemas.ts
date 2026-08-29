import { z } from "zod";
import { idSchema, messageIdSchema, ciphertextSchema } from "./commonSchemas";

/**
 * GET /api/messages/:roomId Params Schema
 */
export const getMessagesParamsSchema = z
  .object({
    roomId: idSchema,
  })
  .strict();

export type GetMessagesParamsInput = z.infer<typeof getMessagesParamsSchema>;

/**
 * GET /api/messages/:roomId Query Schema
 */
export const getMessagesQuerySchema = z
  .object({
    limit: z
      .coerce
      .number({
        invalid_type_error: "Limit must be a number",
      })
      .int("Limit must be an integer")
      .positive("Limit must be positive")
      .max(200, "Limit cannot exceed 200")
      .default(100)
      .optional(),
    before: z.string().trim().max(128).optional(),
    after: z.string().trim().max(128).optional(),
  })
  .strict();

export type GetMessagesQueryInput = z.infer<typeof getMessagesQuerySchema>;

/**
 * Direct Message Queue Payload Schema
 */
export const queueDirectMessageSchema = z
  .object({
    messageId: messageIdSchema,
    recipientId: idSchema,
    senderId: idSchema,
    senderUsername: z.string().trim().min(1).max(50),
    ciphertext: ciphertextSchema,
  })
  .strict();

export type QueueDirectMessageInput = z.infer<typeof queueDirectMessageSchema>;
