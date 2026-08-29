import { Hono } from "hono";
import { MessageService } from "../services";
import { validateParams, validateQuery } from "../middleware/validation";
import { getMessagesParamsSchema, getMessagesQuerySchema, GetMessagesParamsInput, GetMessagesQueryInput } from "../validation";
import { centralizedErrorHandler } from "../middleware/errorHandler";

export const messagesRouter = new Hono();
messagesRouter.onError(centralizedErrorHandler);

// GET /api/messages/:roomId - Get message history
messagesRouter.get(
  "/:roomId",
  validateParams(getMessagesParamsSchema),
  validateQuery(getMessagesQuerySchema),
  async (c) => {
    const { roomId } = c.get("validParams") as GetMessagesParamsInput;
    const query = (c.get("validQuery") || {}) as GetMessagesQueryInput;
    const limit = query.limit || 100;

    const messages = await MessageService.getRoomMessages(roomId, limit);
    return c.json({ messages });
  }
);
