import { z } from "zod";
import { idSchema } from "./commonSchemas";

/**
 * POST /api/rooms Schema
 */
export const createRoomSchema = z
  .object({
    name: z
      .string({
        required_error: "Room name is required",
        invalid_type_error: "Room name must be a string",
      })
      .trim()
      .min(2, "Room name must be at least 2 characters")
      .max(50, "Room name cannot exceed 50 characters"),
    description: z
      .string({
        invalid_type_error: "Description must be a string",
      })
      .trim()
      .max(200, "Description cannot exceed 200 characters")
      .optional()
      .default(""),
    isPrivate: z
      .union([z.boolean(), z.number().int().min(0).max(1)])
      .optional()
      .default(false),
  })
  .strict();

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

/**
 * Room ID Param Schema
 */
export const roomParamSchema = z
  .object({
    roomId: idSchema,
  })
  .strict();

export type RoomParamInput = z.infer<typeof roomParamSchema>;
