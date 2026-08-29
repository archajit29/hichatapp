import { Hono } from "hono";
import { AuthService } from "../services";
import { centralizedErrorHandler } from "../middleware/errorHandler";

export const usersRouter = new Hono();
usersRouter.onError(centralizedErrorHandler);

// GET /api/users - List all users and their public keys
usersRouter.get("/", async (c) => {
  const users = await AuthService.listUsers();
  return c.json({ users });
});
