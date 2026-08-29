import { query, transaction } from "../db/postgres";
import { MailboxItem, MessageDelivery } from "./types";

export class MailboxRepository {
  async queueMessage(data: {
    messageId: string;
    recipientId: string;
    senderId: string;
    senderUsername: string;
    ciphertext: string;
  }): Promise<number> {
    const mailboxId = await transaction(async (client) => {
      const mailboxRes = await client.query(
        `INSERT INTO mailbox (message_id, recipient_id, sender_id, sender_username, ciphertext, status)
         VALUES ($1, $2, $3, $4, $5, 'queued')
         RETURNING id`,
        [
          data.messageId,
          data.recipientId,
          data.senderId,
          data.senderUsername,
          data.ciphertext,
        ]
      );
      const insertedId = Number(mailboxRes.rows[0].id);

      await client.query(
        `INSERT INTO message_deliveries (message_id, sender_id, recipient_id, status, queued_at, attempt_count, next_retry_at)
         VALUES ($1, $2, $3, 'queued', NOW(), 0, NOW())
         ON CONFLICT (message_id) DO UPDATE SET
           status = 'queued',
           queued_at = NOW(),
           attempt_count = 0,
           next_retry_at = NOW()`,
        [data.messageId, data.senderId, data.recipientId]
      );

      return insertedId;
    });

    return mailboxId;
  }

  async incrementAttempt(
    messageId: string,
    nextDelayMs?: number
  ): Promise<{ attemptCount: number; lastAttemptAt: string; nextRetryAt: string | null }> {
    return await transaction(async (client) => {
      const nextRetryIso =
        typeof nextDelayMs === "number" && nextDelayMs > 0
          ? new Date(Date.now() + nextDelayMs).toISOString()
          : typeof nextDelayMs === "number" && nextDelayMs === 0
          ? new Date().toISOString()
          : null;

      const qRes = await client.query(
        `UPDATE message_deliveries
         SET attempt_count = COALESCE(attempt_count, 0) + 1,
             last_attempt_at = NOW(),
             next_retry_at = COALESCE($1, next_retry_at)
         WHERE message_id = $2
         RETURNING attempt_count, last_attempt_at, next_retry_at`,
        [nextRetryIso, messageId]
      );

      const row = qRes.rows[0];
      return {
        attemptCount: row ? Number(row.attempt_count) : 1,
        lastAttemptAt: row?.last_attempt_at || new Date().toISOString(),
        nextRetryAt: row?.next_retry_at || null,
      };
    });
  }

  async scheduleRetry(
    messageId: string,
    delayMs: number,
    _reason?: string
  ): Promise<{ nextRetryAt: string; attemptCount: number }> {
    return await transaction(async (client) => {
      const nextRetryIso = new Date(Date.now() + Math.max(0, delayMs)).toISOString();

      await client.query(
        `UPDATE message_deliveries
         SET status = 'queued',
             next_retry_at = $1
         WHERE message_id = $2 AND status NOT IN ('acknowledged', 'read', 'failed')`,
        [nextRetryIso, messageId]
      );

      await client.query(
        `UPDATE mailbox
         SET status = 'queued',
             delivered_at = NULL
         WHERE message_id = $1 AND status NOT IN ('acknowledged', 'failed')`,
        [messageId]
      );

      const qRes = await client.query(
        `SELECT attempt_count, next_retry_at
         FROM message_deliveries
         WHERE message_id = $1`,
        [messageId]
      );

      const row = qRes.rows[0];
      return {
        nextRetryAt: row?.next_retry_at || nextRetryIso,
        attemptCount: row ? Number(row.attempt_count) : 0,
      };
    });
  }

  async markFailed(
    messageId: string,
    _reason?: string
  ): Promise<{ senderId: string; recipientId: string; attemptCount: number } | null> {
    return await transaction(async (client) => {
      const rowRes = await client.query(
        `SELECT sender_id, recipient_id, COALESCE(attempt_count, 0) as attempt_count
         FROM message_deliveries
         WHERE message_id = $1`,
        [messageId]
      );

      let row = rowRes.rows[0];
      if (!row) {
        const mRowRes = await client.query(
          `SELECT sender_id, recipient_id
           FROM mailbox
           WHERE message_id = $1`,
          [messageId]
        );
        const mRow = mRowRes.rows[0];
        if (!mRow) return null;
        row = { sender_id: mRow.sender_id, recipient_id: mRow.recipient_id, attempt_count: 0 };
      }

      const senderId = row.sender_id || "";
      const recipientId = row.recipient_id || "";
      const attemptCount = Number(row.attempt_count || 0);

      await client.query(
        `UPDATE message_deliveries
         SET status = 'failed',
             next_retry_at = NULL
         WHERE message_id = $1`,
        [messageId]
      );

      await client.query(
        `UPDATE mailbox
         SET status = 'failed'
         WHERE message_id = $1`,
        [messageId]
      );

      return { senderId, recipientId, attemptCount };
    });
  }

  async findRetryCandidates(
    maxRetries: number,
    limit = 100
  ): Promise<Array<MailboxItem & { attempt_count: number; next_retry_at: string | null; last_attempt_at: string | null }>> {
    const nowIso = new Date().toISOString();
    const res = await query<MailboxItem & { attempt_count: number; next_retry_at: string | null; last_attempt_at: string | null }>(
      `SELECT m.id, m.message_id, m.recipient_id, m.sender_id, m.sender_username, m.ciphertext, m.status,
              m.delivered_at, m.acknowledged_at, m.read_at, m.created_at,
              COALESCE(d.attempt_count, 0) AS attempt_count,
              d.last_attempt_at,
              d.next_retry_at
       FROM mailbox m
       INNER JOIN message_deliveries d ON m.message_id = d.message_id
       WHERE m.status IN ('queued', 'delivered')
         AND d.status IN ('queued', 'delivered')
         AND (
           d.next_retry_at IS NULL
           OR d.next_retry_at <= NOW()
           OR d.next_retry_at <= $1
         )
         AND COALESCE(d.attempt_count, 0) < $2
       ORDER BY m.id ASC
       LIMIT $3`,
      [nowIso, maxRetries, limit]
    );

    return (res.rows || []).map((r: any) => ({
      ...r,
      id: Number(r.id),
      attempt_count: Number(r.attempt_count),
    }));
  }

  async findExhaustedDeliveries(
    maxRetries: number,
    limit = 100
  ): Promise<Array<{ id: number; message_id: string; sender_id: string; recipient_id: string; attempt_count: number }>> {
    const res = await query(
      `SELECT m.id, m.message_id, m.recipient_id, m.sender_id,
              COALESCE(d.attempt_count, 0) AS attempt_count
       FROM mailbox m
       INNER JOIN message_deliveries d ON m.message_id = d.message_id
       WHERE m.status IN ('queued', 'delivered')
         AND d.status IN ('queued', 'delivered')
         AND COALESCE(d.attempt_count, 0) >= $1
       ORDER BY m.id ASC
       LIMIT $2`,
      [maxRetries, limit]
    );

    return (res.rows || []).map((r: any) => ({
      id: Number(r.id),
      message_id: r.message_id,
      sender_id: r.sender_id,
      recipient_id: r.recipient_id,
      attempt_count: Number(r.attempt_count),
    }));
  }

  async getPendingForRecipient(recipientId: string, limit = 50): Promise<MailboxItem[]> {
    const res = await query<MailboxItem>(
      `SELECT id, message_id, recipient_id, sender_id, sender_username, ciphertext, status, delivered_at, acknowledged_at, read_at, created_at
       FROM mailbox
       WHERE recipient_id = $1 AND status != 'failed'
       ORDER BY id ASC
       LIMIT $2`,
      [recipientId, limit]
    );

    return (res.rows || []).map((r: any) => ({ ...r, id: Number(r.id) }));
  }

  async getUnacknowledgedForRetry(limit = 100): Promise<MailboxItem[]> {
    const res = await query<MailboxItem>(
      `SELECT id, message_id, recipient_id, sender_id, sender_username, ciphertext, status, delivered_at, acknowledged_at, read_at, created_at
       FROM mailbox
       WHERE (status = 'queued' OR (status = 'delivered' AND delivered_at <= NOW() - INTERVAL '5 seconds'))
       ORDER BY id ASC
       LIMIT $1`,
      [limit]
    );

    return (res.rows || []).map((r: any) => ({ ...r, id: Number(r.id) }));
  }

  async markDelivered(mailboxId: number, messageId: string): Promise<void> {
    await transaction(async (client) => {
      await client.query("UPDATE mailbox SET status = 'delivered', delivered_at = NOW() WHERE id = $1", [mailboxId]);
      await client.query("UPDATE message_deliveries SET status = 'delivered', delivered_at = NOW() WHERE message_id = $1", [messageId]);
    });
  }

  async acknowledgeMessage(recipientId: string, messageId: string, mailboxId?: number): Promise<{ senderId: string | null }> {
    return await transaction(async (client) => {
      let senderId: string | null = null;
      if (mailboxId) {
        const existing = await client.query("SELECT sender_id FROM mailbox WHERE id = $1", [mailboxId]);
        senderId = existing.rows[0]?.sender_id || null;
      }

      if (!senderId) {
        const deliv = await client.query("SELECT sender_id FROM message_deliveries WHERE message_id = $1", [messageId]);
        senderId = deliv.rows[0]?.sender_id || null;
      }

      if (mailboxId) {
        await client.query("DELETE FROM mailbox WHERE (id = $1 OR message_id = $2) AND recipient_id = $3", [mailboxId, messageId, recipientId]);
      } else {
        await client.query("DELETE FROM mailbox WHERE message_id = $1 AND recipient_id = $2", [messageId, recipientId]);
      }

      await client.query(
        `INSERT INTO message_deliveries (message_id, sender_id, recipient_id, status, acknowledged_at, next_retry_at)
         VALUES ($1, $2, $3, 'acknowledged', NOW(), NULL)
         ON CONFLICT (message_id) DO UPDATE SET status = 'acknowledged', acknowledged_at = NOW(), next_retry_at = NULL`,
        [messageId, senderId || "", recipientId]
      );

      return { senderId };
    });
  }

  async markRead(recipientId: string, messageId: string, senderId?: string): Promise<string | null> {
    return await transaction(async (client) => {
      let resolvedSenderId = senderId;
      if (!resolvedSenderId) {
        const row = await client.query("SELECT sender_id FROM message_deliveries WHERE message_id = $1", [messageId]);
        resolvedSenderId = row.rows[0]?.sender_id;
      }

      await client.query(
        `UPDATE message_deliveries SET status = 'read', read_at = NOW()
         WHERE message_id = $1 AND recipient_id = $2`,
        [messageId, recipientId]
      );

      return resolvedSenderId || null;
    });
  }

  async recordDecryptionFailure(recipientId: string, messageId: string, senderId?: string): Promise<void> {
    await query(
      `INSERT INTO message_deliveries (message_id, sender_id, recipient_id, status, acknowledged_at)
       VALUES ($1, $2, $3, 'decryption_failed', NOW())
       ON CONFLICT (message_id) DO UPDATE SET status = 'decryption_failed'`,
      [messageId, senderId || "", recipientId]
    );
  }

  async getMessageStatuses(messageIds: string[]): Promise<Record<string, string>> {
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return {};
    }

    const res = await query<{ message_id: string; status: string }>(
      `SELECT message_id, status FROM message_deliveries WHERE message_id = ANY($1::varchar[])`,
      [messageIds]
    );

    const result: Record<string, string> = {};
    for (const r of (res.rows || [])) {
      result[r.message_id] = r.status;
    }
    return result;
  }

  async findByMessageId(messageId: string): Promise<MailboxItem | null> {
    const res = await query<MailboxItem>(
      `SELECT id, message_id, recipient_id, sender_id, sender_username, ciphertext, status, delivered_at, acknowledged_at, read_at, created_at
       FROM mailbox
       WHERE message_id = $1`,
      [messageId]
    );

    const item = res.rows[0];
    return item ? { ...item, id: Number(item.id) } : null;
  }

  async getDeliveryRecord(messageId: string): Promise<MessageDelivery | null> {
    const res = await query<MessageDelivery>(
      `SELECT message_id, sender_id, recipient_id, status, queued_at, delivered_at, acknowledged_at, read_at,
              COALESCE(attempt_count, 0) as attempt_count, last_attempt_at, next_retry_at
       FROM message_deliveries
       WHERE message_id = $1`,
      [messageId]
    );

    const item = res.rows[0];
    return item ? { ...item, attempt_count: Number(item.attempt_count) } : null;
  }

  async getPendingForRecipientSince(
    recipientId: string,
    lastAckedMessageId?: string,
    limit = 100
  ): Promise<MailboxItem[]> {
    let afterId = 0;
    if (lastAckedMessageId) {
      const lastMsg = await this.findByMessageId(lastAckedMessageId);
      if (lastMsg) {
        afterId = lastMsg.id;
      }
    }

    if (afterId > 0) {
      const res = await query<MailboxItem>(
        `SELECT id, message_id, recipient_id, sender_id, sender_username, ciphertext, status, delivered_at, acknowledged_at, read_at, created_at
         FROM mailbox
         WHERE recipient_id = $1 AND id > $2 AND status != 'failed'
         ORDER BY id ASC
         LIMIT $3`,
        [recipientId, afterId, limit]
      );
      return (res.rows || []).map((r: any) => ({ ...r, id: Number(r.id) }));
    }

    return await this.getPendingForRecipient(recipientId, limit);
  }

  async resetToQueued(mailboxId: number, messageId: string): Promise<void> {
    await transaction(async (client) => {
      await client.query("UPDATE mailbox SET status = 'queued', delivered_at = NULL WHERE id = $1 AND status != 'acknowledged' AND status != 'failed'", [mailboxId]);
      await client.query("UPDATE message_deliveries SET status = 'queued' WHERE message_id = $1 AND status NOT IN ('acknowledged', 'read', 'failed')", [messageId]);
    });
  }
}

export const mailboxRepository = new MailboxRepository();
