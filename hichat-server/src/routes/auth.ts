import { Hono } from "hono";
import { AuthService } from "../services";
import { ValidationError } from "../core/errors";
import { centralizedErrorHandler } from "../middleware/errorHandler";
import { cookieUtils, getClientIp, securityAuditLog } from "../middleware/security";
import { validateBody } from "../middleware/validation";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  updateKeySchema,
  RegisterInput,
  LoginInput,
  UpdateKeyInput,
} from "../validation";

export const authRouter = new Hono();
authRouter.onError(centralizedErrorHandler);

// GET /api/auth/csrf - Issue anti-CSRF token
authRouter.get("/csrf", (c) => {
  const csrfToken = cookieUtils.generateCsrfToken();
  cookieUtils.setAuthCookies(c, { refreshToken: "", csrfToken });
  return c.json({
    success: true,
    csrfToken,
  });
});

// POST /api/auth/register
authRouter.post("/register", validateBody(registerSchema), async (c) => {
  const body = c.get("validJson") as RegisterInput;
  const userAgent = c.req.header("user-agent");
  const ipAddress = getClientIp(c);

  const { token, accessToken, refreshToken, user } = await AuthService.register(body, {
    userAgent,
    ipAddress,
  });

  const csrfToken = cookieUtils.setAuthCookies(c, { refreshToken });

  securityAuditLog(c, {
    eventType: "LOGIN_SUCCESS",
    userId: user.id,
    metadata: { action: "register", username: user.username },
  });

  return c.json({
    success: true,
    message: "Registration successful",
    token,
    accessToken,
    refreshToken,
    csrfToken,
    user,
  });
});

// POST /api/auth/login
authRouter.post("/login", validateBody(loginSchema), async (c) => {
  const body = c.get("validJson") as LoginInput;
  const userAgent = c.req.header("user-agent");
  const ipAddress = getClientIp(c);

  try {
    const { token, accessToken, refreshToken, user } = await AuthService.login(body, {
      userAgent,
      ipAddress,
    });

    const csrfToken = cookieUtils.setAuthCookies(c, { refreshToken });

    securityAuditLog(c, {
      eventType: "LOGIN_SUCCESS",
      userId: user.id,
      metadata: { username: user.username },
    });

    return c.json({
      success: true,
      message: "Login successful",
      token,
      accessToken,
      refreshToken,
      csrfToken,
      user,
    });
  } catch (err: any) {
    securityAuditLog(c, {
      eventType: "LOGIN_FAILURE",
      metadata: { username: body?.username, reason: err.message },
    });
    throw err;
  }
});

// POST /api/auth/refresh
authRouter.post("/refresh", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch (_) {
    body = {};
  }

  const refreshToken = cookieUtils.getRefreshToken(c, body);

  if (!refreshToken) {
    throw new ValidationError("Refresh token is required", {
      refreshToken: "Refresh token is required",
    });
  }

  const userAgent = c.req.header("user-agent");
  const ipAddress = getClientIp(c);

  const { token, accessToken, refreshToken: newRefreshToken, user } = await AuthService.rotateRefreshToken(
    refreshToken,
    {
      userAgent,
      ipAddress,
    }
  );

  const csrfToken = cookieUtils.setAuthCookies(c, { refreshToken: newRefreshToken });

  securityAuditLog(c, {
    eventType: "REFRESH_TOKEN_ROTATED",
    userId: user.id,
    metadata: { username: user.username },
  });

  return c.json({
    success: true,
    message: "Token refreshed successfully",
    token,
    accessToken,
    refreshToken: newRefreshToken,
    csrfToken,
    user,
  });
});

// POST /api/auth/logout
authRouter.post("/logout", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch (_) {
    body = {};
  }

  const refreshToken = cookieUtils.getRefreshToken(c, body);
  const authHeader = c.req.header("Authorization");

  await AuthService.logout(refreshToken, authHeader);
  cookieUtils.clearAuthCookies(c);

  securityAuditLog(c, {
    eventType: "LOGOUT",
  });

  return c.json({
    success: true,
    message: "Logged out successfully",
  });
});

// POST /api/auth/logout-all
authRouter.post("/logout-all", async (c) => {
  const authHeader = c.req.header("Authorization");
  const user = await AuthService.getAuthenticatedUser(authHeader);

  await AuthService.logoutAll(user.id);
  cookieUtils.clearAuthCookies(c);

  securityAuditLog(c, {
    eventType: "LOGOUT_ALL",
    userId: user.id,
  });

  return c.json({
    success: true,
    message: "All sessions logged out successfully",
  });
});

// GET /api/auth/me
authRouter.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  const user = await AuthService.getAuthenticatedUser(authHeader);

  return c.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      publicKey: user.public_key,
      avatarUrl: user.avatar_url,
      status: user.status,
    },
  });
});

// POST /api/auth/update-key
authRouter.post("/update-key", validateBody(updateKeySchema), async (c) => {
  const authHeader = c.req.header("Authorization");
  const user = await AuthService.getAuthenticatedUser(authHeader);

  const { publicKey } = c.get("validJson") as UpdateKeyInput;
  await AuthService.updateUserPublicKey(user.id, publicKey);

  return c.json({ success: true });
});
