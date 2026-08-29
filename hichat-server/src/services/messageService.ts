import {
  messageRepository,
  mailboxRepository,
  userRepository,
  MessageRepository,
  MailboxRepository,
  UserRepository,
  Message,
  MailboxItem,
  MessageDelivery,
} from "../repositories";
import { config } from "../core/config";

export interface SendRoomMessageInput {
  roomId: string;
  senderId: string;
  senderUsername: string;
  payloads: any;
  mediaUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

export interface QueueDirectMessageInput {
  messageId: string;
  recipientId: string;
  senderId: string;
  senderUsername: string;
  ciphertext: string | object;
}

export class MessageServiceClass {
  constructor(
    private msgRepo: MessageRepository = messageRepository,
    private mailboxRepo: MailboxRepository = mailboxRepository,
    private userRepo: UserRepository = userRepository
  ) {}

  async getRoomMessages(roomId: string, limit = 100): Promise<any[]> {
    const rawMessages = await this.msgRepo.listByRoom(roomId, limit);

    return (rawMessages || []).map((msg) => {
      let parsedPayloads = {};
      try {
        parsedPayloads = typeof msg.payloads === "string" ? JSON.parse(msg.payloads) : (msg.payloads || {});
      } catch (e) {
        parsedPayloads = {};
      }

      let formattedTime = "";
      try {
        const dateObj = new Date(msg.created_at ? String(msg.created_at).replace(" ", "T") : Date.now());
        formattedTime = isNaN(dateObj.getTime()) ? "" : dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } catch (e) {
        formattedTime = "";
      }

      return {
        id: msg.id,
        roomId: msg.room_id,
        senderId: msg.sender_id,
        author: msg.sender_username,
        payloads: parsedPayloads,
        mediaUrl: msg.media_url,
        fileName: msg.file_name,
        fileSize: msg.file_size,
        isDeleted: Boolean(msg.is_deleted),
        createdAt: msg.created_at,
        time: formattedTime,
      };
    });
  }

  async sendRoomMessage(input: SendRoomMessageInput): Promise<Message> {
    const msgId = "msg_" + Math.random().toString(36).substring(2, 12);
    const serializedPayloads = typeof input.payloads === "string" ? input.payloads : JSON.stringify(input.payloads);

    return await this.msgRepo.create({
      id: msgId,
      room_id: input.roomId,
      sender_id: input.senderId,
      sender_username: input.senderUsername,
      payloads: serializedPayloads,
      media_url: input.mediaUrl || null,
      file_name: input.fileName || null,
      file_size: input.fileSize || null,
    });
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.msgRepo.softDelete(messageId);
  }

  async queueDirectMessage(input: QueueDirectMessageInput): Promise<{
    mailboxId: number;
    canonicalRecipientId: string;
    serializedCiphertext: string;
  }> {
    const recipientUser = await this.userRepo.findByIdOrUsername(input.recipientId);
    const canonicalRecipientId = recipientUser?.id || input.recipientId;
    const serializedCiphertext = typeof input.ciphertext === "string" ? input.ciphertext : JSON.stringify(input.ciphertext);

    const mailboxId = await this.mailboxRepo.queueMessage({
      messageId: input.messageId,
      recipientId: canonicalRecipientId,
      senderId: input.senderId,
      senderUsername: input.senderUsername,
      ciphertext: serializedCiphertext,
    });

    return {
      mailboxId: Number(mailboxId),
      canonicalRecipientId,
      serializedCiphertext,
    };
  }

  calculateRetryDelay(attemptCount: number, customDelays?: number[]): number {
    const delays = customDelays || (config as any)?.mailbox?.retryDelays || [0, 5000, 15000, 30000, 60000];
    const index = Math.max(0, Math.min(attemptCount - 1, delays.length - 1));
    return delays[index];
  }

  async incrementAttempt(messageId: string, nextDelayMs?: number): Promise<{ attemptCount: number; lastAttemptAt: string; nextRetryAt: string | null }> {
    return await this.mailboxRepo.incrementAttempt(messageId, nextDelayMs);
  }

  async scheduleRetry(messageId: string, delayMs: number, reason?: string): Promise<{ nextRetryAt: string; attemptCount: number }> {
    return await this.mailboxRepo.scheduleRetry(messageId, delayMs, reason);
  }

  async markDeliveryFailed(messageId: string, reason?: string): Promise<{ senderId: string; recipientId: string; attemptCount: number } | null> {
    return await this.mailboxRepo.markFailed(messageId, reason);
  }

  async findRetryCandidates(maxRetries?: number, limit = 100): Promise<Array<MailboxItem & { attempt_count: number; next_retry_at: string | null; last_attempt_at: string | null }>> {
    const max = maxRetries ?? (config as any)?.mailbox?.maxRetries ?? 5;
    return await this.mailboxRepo.findRetryCandidates(max, limit);
  }

  async findExhaustedDeliveries(maxRetries?: number, limit = 100): Promise<Array<{ id: number; message_id: string; sender_id: string; recipient_id: string; attempt_count: number }>> {
    const max = maxRetries ?? (config as any)?.mailbox?.maxRetries ?? 5;
    return await this.mailboxRepo.findExhaustedDeliveries(max, limit);
  }

  async handleAckTimeout(mailboxId: number, messageId: string, options?: { maxRetries?: number; customDelays?: number[] }): Promise<{
    failed: boolean;
    attemptCount: number;
    senderId: string;
    recipientId: string;
    reason?: string;
    nextRetryAt?: string;
    delayMs?: number;
  }> {
    const maxRetries = options?.maxRetries ?? (config as any)?.mailbox?.maxRetries ?? 5;
    const deliv = await this.getDeliveryRecord(messageId);
    const currentAttempts = deliv?.attempt_count || 1;

    if (currentAttempts >= maxRetries) {
      const failInfo = await this.mailboxRepo.markFailed(messageId, "MAX_RETRIES_EXCEEDED");
      return {
        failed: true,
        attemptCount: currentAttempts,
        senderId: failInfo?.senderId || deliv?.sender_id || "",
        recipientId: failInfo?.recipientId || deliv?.recipient_id || "",
        reason: "MAX_RETRIES_EXCEEDED",
      };
    } else {
      const nextDelayMs = this.calculateRetryDelay(currentAttempts + 1, options?.customDelays);
      const sched = await this.mailboxRepo.scheduleRetry(messageId, nextDelayMs, "ACK_TIMEOUT");
      return {
        failed: false,
        attemptCount: currentAttempts,
        senderId: deliv?.sender_id || "",
        recipientId: deliv?.recipient_id || "",
        nextRetryAt: sched.nextRetryAt,
        delayMs: nextDelayMs,
      };
    }
  }

  async processRetryQueue(onlineUserIds: Set<string>, options?: { maxRetries?: number; limit?: number; customDelays?: number[] }): Promise<{
    failedMessages: Array<{ messageId: string; senderId: string; recipientId: string; attemptCount: number; reason: string }>;
    retryDispatches: Array<{
      mailboxId: number;
      messageId: string;
      recipientId: string;
      senderId: string;
      senderUsername: string;
      ciphertext: string;
      timestamp: string;
      attemptCount: number;
      nextRetryAt: string | null;
    }>;
  }> {
    const maxRetries = options?.maxRetries ?? (config as any)?.mailbox?.maxRetries ?? 5;
    const limit = options?.limit ?? 100;

    const failedMessages: Array<{ messageId: string; senderId: string; recipientId: string; attemptCount: number; reason: string }> = [];
    const retryDispatches: Array<{
      mailboxId: number;
      messageId: string;
      recipientId: string;
      senderId: string;
      senderUsername: string;
      ciphertext: string;
      timestamp: string;
      attemptCount: number;
      nextRetryAt: string | null;
    }> = [];

    const exhausted = await this.mailboxRepo.findExhaustedDeliveries(maxRetries, limit);
    for (const ex of exhausted) {
      const failInfo = await this.mailboxRepo.markFailed(ex.message_id, "MAX_RETRIES_EXCEEDED");
      if (failInfo) {
        failedMessages.push({
          messageId: ex.message_id,
          senderId: failInfo.senderId,
          recipientId: failInfo.recipientId,
          attemptCount: failInfo.attemptCount,
          reason: "MAX_RETRIES_EXCEEDED",
        });
      }
    }

    const candidates = await this.mailboxRepo.findRetryCandidates(maxRetries, limit);
    for (const candidate of candidates) {
      if (onlineUserIds.has(candidate.recipient_id)) {
        const nextAttempt = (candidate.attempt_count || 0) + 1;
        const nextDelayMs = this.calculateRetryDelay(nextAttempt + 1, options?.customDelays);
        const attemptInfo = await this.mailboxRepo.incrementAttempt(candidate.message_id, nextDelayMs);
        await this.mailboxRepo.markDelivered(candidate.id, candidate.message_id);

        retryDispatches.push({
          mailboxId: candidate.id,
          messageId: candidate.message_id,
          recipientId: candidate.recipient_id,
          senderId: candidate.sender_id,
          senderUsername: candidate.sender_username,
          ciphertext: candidate.ciphertext,
          timestamp: candidate.created_at,
          attemptCount: attemptInfo.attemptCount,
          nextRetryAt: attemptInfo.nextRetryAt,
        });
      }
    }

    return {
      failedMessages,
      retryDispatches,
    };
  }

  async markMailboxDelivered(mailboxId: number, messageId: string): Promise<void> {
    await this.mailboxRepo.markDelivered(mailboxId, messageId);
  }

  async acknowledgeDirectMessage(recipientId: string, messageId: string, mailboxId?: number): Promise<{ senderId: string | null }> {
    return await this.mailboxRepo.acknowledgeMessage(recipientId, messageId, mailboxId);
  }

  async markDirectMessageRead(recipientId: string, messageId: string, senderId?: string): Promise<string | null> {
    return await this.mailboxRepo.markRead(recipientId, messageId, senderId);
  }

  async recordDecryptionFailure(recipientId: string, messageId: string, senderId?: string): Promise<void> {
    await this.mailboxRepo.recordDecryptionFailure(recipientId, messageId, senderId);
  }

  async getMessageStatuses(messageIds: string[]): Promise<Record<string, string>> {
    return await this.mailboxRepo.getMessageStatuses(messageIds);
  }

  async getPendingMailbox(recipientId: string): Promise<MailboxItem[]> {
    return await this.mailboxRepo.getPendingForRecipient(recipientId);
  }

  async getPendingMailboxSince(recipientId: string, lastAckedMessageId?: string, limit = 100): Promise<MailboxItem[]> {
    return await this.mailboxRepo.getPendingForRecipientSince(recipientId, lastAckedMessageId, limit);
  }

  async findByMessageId(messageId: string): Promise<MailboxItem | null> {
    return await this.mailboxRepo.findByMessageId(messageId);
  }

  async getDeliveryRecord(messageId: string): Promise<MessageDelivery | null> {
    return await this.mailboxRepo.getDeliveryRecord(messageId);
  }

  async resetToQueued(mailboxId: number, messageId: string): Promise<void> {
    await this.mailboxRepo.resetToQueued(mailboxId, messageId);
  }

  async getUnacknowledgedForRetry(limit = 100): Promise<MailboxItem[]> {
    return await this.mailboxRepo.getUnacknowledgedForRetry(limit);
  }

  async count(): Promise<number> {
    return await this.msgRepo.count();
  }
}

export const MessageService = new MessageServiceClass();
