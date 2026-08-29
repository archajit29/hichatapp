import crypto from "crypto";
import jwt from "jsonwebtoken";
import { AppError, ErrorCode, ValidationError, ConflictError, AuthenticationError, NotFoundError, RefreshTokenReuseError } from "../core/errors";
import { config } from "../core/config";
import { logger } from "../core/logger";
import {
  userRepository,
  authRepository,
  refreshTokenRepository,
  UserRepository,
  AuthRepository,
  RefreshTokenRepository,
  User,
  RefreshToken,
} from "../repositories";
import { transaction, makeDual } from "../db/postgres";

const JWT_SECRET = config.auth.jwtSecret;
const authLogger = logger.child({ module: "auth" });

export type UserRecord = User;

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  publicKey?: string | null;
}

export interface LoginInput {
  username: string;
  password: string;
  publicKey?: string | null;
}

export interface AuthSessionResult {
  token: string;
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    email: string;
    publicKey: string | null;
    avatarUrl: string | null;
    status: string;
  };
}

export interface ClientMetadata {
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * Parses duration string (e.g. '15m', '7d', '1h', '30s') into milliseconds.
 */
export function parseDurationToMs(durationStr: string): number {
  const match = String(durationStr).trim().match(/^(\d+)\s*([smhdwy]?)$/i);
  if (!match) {
    return 15 * 60 * 1000; // default 15m
  }
  const value = parseInt(match[1], 10);
  const unit = (match[2] || "m").toLowerCase();

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    case "w":
      return value * 7 * 24 * 60 * 60 * 1000;
    case "y":
      return value * 365 * 24 * 60 * 60 * 1000;
    default:
      return value * 60 * 1000;
  }
}

export class AuthServiceClass {
  constructor(
    private userRepo: UserRepository = userRepository,
    private authRepo: AuthRepository = authRepository,
    private refreshTokenRepo: RefreshTokenRepository = refreshTokenRepository
  ) {}

  async hashPassword(password: string): Promise<string> {
    return await Bun.password.hash(password, {
      algorithm: "argon2id",
      memoryCost: 65536,
      timeCost: 2,
    });
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return await Bun.password.verify(password, hash);
  }

  /**
   * Hashes a raw refresh token with SHA-256 for secure database storage.
   */
  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Generates a cryptographically secure random opaque refresh token.
   */
  generateRefreshToken(): string {
    return "rt_" + crypto.randomBytes(32).toString("hex");
  }

  /**
   * Generates a short-lived access JWT.
   */
  generateAccessToken(user: { id: string; username: string; email: string }): string {
    return jwt.sign(
      { id: user.id, username: user.username, email: user.email, type: "access" },
      JWT_SECRET,
      { expiresIn: config.auth.jwtAccessExpiresIn as any }
    );
  }

  /**
   * Backward-compatible alias for generateAccessToken.
   */
  generateToken(user: { id: string; username: string; email: string }): string {
    return this.generateAccessToken(user);
  }

  /**
   * Verifies access JWT signature, expiration, and payload.
   */
  verifyToken(token: string): { id: string; username: string; email: string } {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string; email: string };
      return decoded;
    } catch (err) {
      throw new AppError("Invalid or expired session", ErrorCode.UNAUTHORIZED, 401);
    }
  }

  /**
   * Calculates expiration timestamp Date from a duration string.
   */
  calculateExpiry(durationStr: string): Date {
    const ms = parseDurationToMs(durationStr);
    return new Date(Date.now() + ms);
  }

  /**
   * Creates a new refresh token record in the database for a user session.
   */
  async createRefreshSession(
    userId: string,
    meta?: ClientMetadata & { familyId?: string; parentTokenId?: string }
  ): Promise<{ refreshToken: string; tokenRecord: RefreshToken }> {
    const rawRefreshToken = this.generateRefreshToken();
    const tokenHash = this.hashToken(rawRefreshToken);
    const tokenId = "rt_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 8);
    const familyId = meta?.familyId || "fam_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 8);
    const expiresAt = this.calculateExpiry(config.auth.jwtRefreshExpiresIn).toISOString();

    const tokenRecord = await this.refreshTokenRepo.create({
      id: tokenId,
      user_id: userId,
      token_hash: tokenHash,
      family_id: familyId,
      parent_token_id: meta?.parentTokenId || null,
      expires_at: expiresAt,
      user_agent: meta?.userAgent || null,
      ip_address: meta?.ipAddress || null,
    });

    return { refreshToken: rawRefreshToken, tokenRecord };
  }

  async register(input: RegisterInput, meta?: ClientMetadata): Promise<AuthSessionResult> {
    const { username, email, password, publicKey } = input;

    if (!username || !email || !password) {
      throw new ValidationError("Username, email, and password are required");
    }

    const existingUser = await this.authRepo.findByUsername(username);
    if (existingUser) {
      throw new ConflictError("Username is already taken");
    }

    const userId = "u_" + Math.random().toString(36).substring(2, 10);
    const passwordHash = await this.hashPassword(password);
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`;

    await this.authRepo.registerUserInTransaction({
      id: userId,
      username,
      email,
      password_hash: passwordHash,
      avatar_url: avatarUrl,
    });

    if (publicKey) {
      await this.userRepo.updatePublicKey(userId, publicKey);
    }

    const userObj = {
      id: userId,
      username,
      email,
      publicKey: publicKey || null,
      avatarUrl,
      status: "online",
    };

    const accessToken = this.generateAccessToken(userObj);
    const { refreshToken } = await this.createRefreshSession(userId, meta);

    return {
      token: accessToken,
      accessToken,
      refreshToken,
      user: userObj,
    };
  }

  async login(input: LoginInput, meta?: ClientMetadata): Promise<AuthSessionResult> {
    const { username, password, publicKey } = input;

    if (!username || !password) {
      throw new ValidationError("Username and password required");
    }

    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new AuthenticationError("Invalid username or password");
    }

    const isValid = await this.comparePassword(password, user.password_hash);
    if (!isValid) {
      throw new AuthenticationError("Invalid username or password");
    }

    if (publicKey) {
      await this.updateUserPublicKey(user.id, publicKey);
      user.public_key = publicKey;
    }

    const userObj = {
      id: user.id,
      username: user.username,
      email: user.email,
      publicKey: user.public_key,
      avatarUrl: user.avatar_url,
      status: user.status,
    };

    const accessToken = this.generateAccessToken(userObj);
    const { refreshToken } = await this.createRefreshSession(user.id, meta);

    return {
      token: accessToken,
      accessToken,
      refreshToken,
      user: userObj,
    };
  }

  /**
   * Secure Refresh Token Rotation & Theft Detection (OAuth 2.0 / RFC 6749 compliant)
   */
  async rotateRefreshToken(rawRefreshToken: string, meta?: ClientMetadata): Promise<AuthSessionResult> {
    if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
      throw new ValidationError("Refresh token is required");
    }

    const tokenHash = this.hashToken(rawRefreshToken);

    const result = await transaction(async (client) => {
      const res = await client.query(
        "SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE",
        [tokenHash]
      );
      const existingToken = res.rows[0] || null;

      if (!existingToken) {
        throw new AuthenticationError("Invalid refresh token");
      }

      if (existingToken.is_revoked === 1) {
        return {
          theftDetected: true as const,
          existingToken,
        };
      }

      const expiresAtTime = new Date(existingToken.expires_at).getTime();
      if (Number.isNaN(expiresAtTime) || expiresAtTime <= Date.now()) {
        await client.query("UPDATE refresh_tokens SET is_revoked = 1, revoked_at = NOW() WHERE id = $1", [existingToken.id]);
        throw new AuthenticationError("Refresh token has expired. Please log in again.");
      }

      const userRes = await client.query("SELECT * FROM users WHERE id = $1", [existingToken.user_id]);
      const user = userRes.rows[0] || null;
      if (!user) {
        await client.query("UPDATE refresh_tokens SET is_revoked = 1, revoked_at = NOW() WHERE id = $1", [existingToken.id]);
        throw new NotFoundError("User not found");
      }

      const newRawRefreshToken = this.generateRefreshToken();
      const newTokenHash = this.hashToken(newRawRefreshToken);
      const newTokenId = "rt_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 8);
      const newExpiresAt = this.calculateExpiry(config.auth.jwtRefreshExpiresIn).toISOString();

      await client.query(
        `INSERT INTO refresh_tokens (
          id, user_id, token_hash, family_id, parent_token_id, 
          is_revoked, user_agent, ip_address, expires_at
        ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)`,
        [
          newTokenId,
          user.id,
          newTokenHash,
          existingToken.family_id,
          existingToken.id,
          meta?.userAgent || existingToken.user_agent,
          meta?.ipAddress || existingToken.ip_address,
          newExpiresAt,
        ]
      );

      await client.query(
        "UPDATE refresh_tokens SET is_revoked = 1, replaced_by = $1, revoked_at = NOW() WHERE id = $2",
        [newTokenId, existingToken.id]
      );

      const userObj = {
        id: user.id,
        username: user.username,
        email: user.email,
        publicKey: user.public_key,
        avatarUrl: user.avatar_url,
        status: user.status,
      };

      const newAccessToken = this.generateAccessToken(userObj);

      return {
        theftDetected: false as const,
        token: newAccessToken,
        accessToken: newAccessToken,
        refreshToken: newRawRefreshToken,
        user: userObj,
        oldTokenId: existingToken.id,
        familyId: existingToken.family_id,
      };
    });

    if (result.theftDetected) {
      const existingToken = result.existingToken;
      const revokedSessionsCount = await this.refreshTokenRepo.revokeAllForUser(existingToken.user_id);

      authLogger.warn(
        {
          event: "REFRESH_TOKEN_THEFT_DETECTED",
          userId: existingToken.user_id,
          familyId: existingToken.family_id,
          tokenId: existingToken.id,
          parentTokenId: existingToken.parent_token_id,
          replacedBy: existingToken.replaced_by,
          revokedAt: existingToken.revoked_at,
          terminatedSessions: revokedSessionsCount,
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        },
        `🚨 CRITICAL SECURITY ALERT: Refresh token reuse detected for user ${existingToken.user_id}! All ${revokedSessionsCount} active sessions terminated immediately.`
      );

      throw new RefreshTokenReuseError(
        "Refresh token reuse detected. All active sessions have been terminated for security."
      );
    }

    authLogger.info(
      {
        userId: result.user.id,
        familyId: result.familyId,
        oldTokenId: result.oldTokenId,
      },
      `🔄 Refresh token rotated successfully for user ${result.user.username}`
    );

    return {
      token: result.token,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  }

  async logout(rawRefreshToken?: string | null, authHeader?: string | null): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = this.hashToken(rawRefreshToken);
      const tokenRecord = await this.refreshTokenRepo.findByTokenHash(tokenHash);
      if (tokenRecord) {
        await this.refreshTokenRepo.revokeToken(tokenRecord.id);
        authLogger.info({ tokenId: tokenRecord.id, userId: tokenRecord.user_id }, "User session logged out");
        return;
      }
    }

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = this.verifyToken(authHeader.split(" ")[1]);
        if (decoded?.id) {
          authLogger.info({ userId: decoded.id }, "Logout requested via bearer token");
        }
      } catch (_) {}
    }
  }

  async logoutAll(userId: string): Promise<number> {
    const count = await this.refreshTokenRepo.revokeAllForUser(userId);
    authLogger.info({ userId, revokedCount: count }, `Logged out all ${count} sessions for user ${userId}`);
    return count;
  }

  async getAuthenticatedUser(authHeader?: string | null): Promise<User> {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AuthenticationError("Authentication token is required");
    }

    const token = authHeader.split(" ")[1];
    const decoded = this.verifyToken(token);
    if (!decoded) {
      throw new AuthenticationError("Invalid or expired authentication token");
    }

    const user = await this.getUserById(decoded.id);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return await this.userRepo.findByUsername(username);
  }

  async getUserById(id: string): Promise<User | null> {
    return await this.userRepo.findById(id);
  }

  async resolveUserId(identifier: string): Promise<string | null> {
    if (!identifier) return null;
    const user = await this.userRepo.findByIdOrUsername(identifier);
    return user?.id || null;
  }

  async updateUserPublicKey(userId: string, publicKeyJwkStr: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    await this.userRepo.updatePublicKey(userId, publicKeyJwkStr);
  }

  async listUsers(): Promise<Array<{ id: string; username: string; email: string; publicKey: string | null; avatarUrl: string | null; status: string; createdAt: string }>> {
    const users = await this.userRepo.list();
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      publicKey: u.public_key,
      avatarUrl: u.avatar_url,
      status: u.status,
      createdAt: u.created_at,
    }));
  }
}

export const AuthService = new AuthServiceClass();
