import { z } from "zod";
import { idSchema, messageIdSchema, ciphertextSchema } from "./commonSchemas";

/**
 * Socket.IO 'join' event payload schema
 */
export const socketJoinSchema = z
  .object({
    username: z
      .string({
        required_error: "Username is required",
        invalid_type_error: "Username must be a string",
      })
      .trim()
      .min(1, "Username cannot be empty")
      .max(50, "Username cannot exceed 50 characters"),
    publicKey: z.string().trim().max(2048).optional(),
    room: z.string().trim().max(100).optional().default("general"),
    status: z.enum(["online", "offline", "away", "dnd"]).optional().default("online"),
    lastAckedMessageId: z.string().trim().max(128).optional(),
    lastAcknowledgedMessageId: z.string().trim().max(128).optional(),
    token: z.string().trim().optional(),
  })
  .strict();

export type SocketJoinInput = z.infer<typeof socketJoinSchema>;

/**
 * Socket.IO 'send_direct_message' event payload schema
 */
export const socketSendDirectMessageSchema = z
  .object({
    messageId: messageIdSchema,
    recipientId: idSchema,
    ciphertext: z.union([
      z.string().trim().min(1, "ciphertext cannot be empty").max(65536, "ciphertext cannot exceed 65536 characters"),
      z.record(z.any()),
    ]),
    recipientUsername: z.string().trim().max(50).optional(),
  })
  .strict();

export type SocketSendDirectMessageInput = z.infer<typeof socketSendDirectMessageSchema>;

/**
 * Socket.IO 'ack_direct_message' event payload schema
 */
export const socketAckDirectMessageSchema = z
  .object({
    messageId: messageIdSchema,
    mailboxId: z
      .coerce
      .number()
      .int("mailboxId must be an integer")
      .positive("mailboxId must be a positive integer")
      .optional(),
    decryptionSuccess: z.boolean().default(true).optional(),
    reason: z.string().trim().max(255).optional(),
  })
  .strict();

export type SocketAckDirectMessageInput = z.infer<typeof socketAckDirectMessageSchema>;

/**
 * Socket.IO 'read_direct_message' event payload schema
 */
export const socketReadDirectMessageSchema = z
  .object({
    messageId: messageIdSchema,
    senderId: idSchema.optional(),
  })
  .strict();

export type SocketReadDirectMessageInput = z.infer<typeof socketReadDirectMessageSchema>;

/**
 * Socket.IO 'resume_delivery' event payload schema
 */
export const socketResumeDeliverySchema = z
  .object({
    lastAcknowledgedMessageId: z
      .string({
        required_error: "lastAcknowledgedMessageId is required",
      })
      .trim()
      .min(1, "lastAcknowledgedMessageId cannot be empty")
      .max(128),
  })
  .strict();

export type SocketResumeDeliveryInput = z.infer<typeof socketResumeDeliverySchema>;

/**
 * Socket.IO 'heartbeat' event payload schema
 */
export const socketHeartbeatSchema = z
  .object({
    timestamp: z.coerce.number().optional(),
  })
  .strict()
  .optional()
  .default({});

export type SocketHeartbeatInput = z.infer<typeof socketHeartbeatSchema>;

/**
 * Socket.IO 'update_status' event payload schema
 */
export const socketUpdateStatusSchema = z
  .object({
    status: z.enum(["online", "offline", "away", "dnd"], {
      errorMap: () => ({ message: "Status must be one of: online, offline, away, dnd" }),
    }),
    customStatus: z.string().trim().max(100, "Custom status cannot exceed 100 characters").optional().default(""),
  })
  .strict();

export type SocketUpdateStatusInput = z.infer<typeof socketUpdateStatusSchema>;

/**
 * Socket.IO 'get_user_presence' event payload schema
 */
export const socketGetUserPresenceSchema = z
  .object({
    userId: idSchema,
  })
  .strict();

export type SocketGetUserPresenceInput = z.infer<typeof socketGetUserPresenceSchema>;
