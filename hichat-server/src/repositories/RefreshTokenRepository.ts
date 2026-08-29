import { query } from "../db/postgres";
import { RefreshToken } from "./types";

export class RefreshTokenRepository {
  async findById(id: string): Promise<RefreshToken | null> {
    const res = await query<RefreshToken>("SELECT * FROM refresh_tokens WHERE id = $1", [id]);
    return res.rows[0] || null;
  }

  async findByTokenHash(tokenHash: string, forUpdate = false): Promise<RefreshToken | null> {
    const sql = forUpdate
      ? "SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE"
      : "SELECT * FROM refresh_tokens WHERE token_hash = $1";
    const res = await query<RefreshToken>(sql, [tokenHash]);
    return res.rows[0] || null;
  }

  async findByTokenHashForUpdate(tokenHash: string, _isPostgres = true): Promise<RefreshToken | null> {
    const sql = "SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE";
    const res = await query<RefreshToken>(sql, [tokenHash]);
    return res.rows[0] || null;
  }

  async findByUserId(userId: string): Promise<RefreshToken[]> {
    const res = await query<RefreshToken>(
      `SELECT * FROM refresh_tokens 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows || [];
  }

  async findActiveByUserId(userId: string): Promise<RefreshToken[]> {
    const res = await query<RefreshToken>(
      `SELECT * FROM refresh_tokens 
       WHERE user_id = $1 AND is_revoked = 0 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows || [];
  }

  async findByFamilyId(familyId: string): Promise<RefreshToken[]> {
    const res = await query<RefreshToken>(
      `SELECT * FROM refresh_tokens 
       WHERE family_id = $1 
       ORDER BY created_at ASC`,
      [familyId]
    );
    return res.rows || [];
  }

  async create(data: {
    id: string;
    user_id: string;
    token_hash: string;
    family_id: string;
    parent_token_id?: string | null;
    expires_at: string;
    user_agent?: string | null;
    ip_address?: string | null;
  }): Promise<RefreshToken> {
    const res = await query<RefreshToken>(
      `INSERT INTO refresh_tokens (
        id, user_id, token_hash, family_id, parent_token_id, 
        is_revoked, user_agent, ip_address, expires_at
      ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)
      RETURNING *`,
      [
        data.id,
        data.user_id,
        data.token_hash,
        data.family_id,
        data.parent_token_id || null,
        data.user_agent || null,
        data.ip_address || null,
        data.expires_at,
      ]
    );

    return res.rows[0] || { ...data, is_revoked: 0, created_at: new Date().toISOString() };
  }

  async revokeToken(id: string, replacedBy?: string | null): Promise<void> {
    await query(
      `UPDATE refresh_tokens 
       SET is_revoked = 1, replaced_by = $1, revoked_at = NOW() 
       WHERE id = $2`,
      [replacedBy || null, id]
    );
  }

  async revokeFamily(familyId: string): Promise<number> {
    const res = await query(
      `UPDATE refresh_tokens 
       SET is_revoked = 1, revoked_at = NOW() 
       WHERE family_id = $1 AND is_revoked = 0`,
      [familyId]
    );
    return res.rowCount || 0;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const res = await query(
      `UPDATE refresh_tokens 
       SET is_revoked = 1, revoked_at = NOW() 
       WHERE user_id = $1 AND is_revoked = 0`,
      [userId]
    );
    return res.rowCount || 0;
  }

  async deleteExpiredTokens(): Promise<number> {
    const res = await query(
      `DELETE FROM refresh_tokens 
       WHERE expires_at < NOW()`
    );
    return res.rowCount || 0;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const res = await query(
      `DELETE FROM refresh_tokens 
       WHERE user_id = $1`,
      [userId]
    );
    return res.rowCount || 0;
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
