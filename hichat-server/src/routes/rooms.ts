import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { AuthService, RoomService } from "../services";
import { ApiResponse, createResponseSchema, ErrorResponseSchema } from "../core/responses";
import { createRoomSchema } from "../validation";
import { centralizedErrorHandler } from "../middleware/errorHandler";

export const roomsRouter = new OpenAPIHono();
roomsRouter.onError(centralizedErrorHandler);

const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isPrivate: z.number(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  messageCount: z.number().optional(),
});

// --- List Rooms ---
const listRoomsRoute = createRoute({
  method: "get",
  path: "/",
  responses: {
    200: {
      content: { "application/json": { schema: createResponseSchema(z.array(RoomSchema)) } },
      description: "List of all rooms",
    },
  },
});

roomsRouter.openapi(listRoomsRoute, async (c) => {
  const roomList = await RoomService.listRooms();
  const rooms = roomList.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isPrivate: r.is_private,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
  return c.json(ApiResponse.success(rooms));
});

// --- Create Room ---
const createRoomRoute = createRoute({
  method: "post",
  path: "/",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createRoomSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: createResponseSchema(RoomSchema) } },
      description: "Room created successfully",
    },
    400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Bad request" },
    401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
  },
});

roomsRouter.openapi(createRoomRoute, async (c) => {
  const authHeader = c.req.header("Authorization");
  const user = await AuthService.getAuthenticatedUser(authHeader);

  const { name, description } = c.req.valid("json");
  const created = await RoomService.createRoom({
    name,
    description: description || "",
    createdBy: user.id,
  });

  const room = {
    id: created.id,
    name: created.name,
    description: created.description || "",
    isPrivate: created.is_private,
    createdBy: created.created_by,
    createdAt: created.created_at,
  };

  return c.json(ApiResponse.success(room, "Room created successfully"), 201);
});
