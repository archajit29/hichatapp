import { z } from "zod";
import { idSchema } from "./commonSchemas";

/**
 * User identifier parameter schema (userId or username)
 */
export const userParamSchema = z
  .object({
    identifier: idSchema,
  })
  .strict();

export type UserParamInput = z.infer<typeof userParamSchema>;

/**
 * User status update schema
 */
export const updateStatusSchema = z
  .object({
    status: z.enum(["online", "offline", "away", "dnd"], {
      errorMap: () => ({ message: "Status must be one of: online, offline, away, dnd" }),
    }),
    customStatus: z.string().trim().max(100, "Custom status cannot exceed 100 characters").optional().default(""),
  })
  .strict();

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
