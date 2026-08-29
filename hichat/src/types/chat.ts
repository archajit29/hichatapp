export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderUsername?: string;
  author?: string;
  payloads?: any;
  message?: string;
  mediaUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  replyTo?: any;
  reactions?: Record<string, number>;
  status?: string;
  time?: string;
  isEdited?: boolean;
  isDeleted?: boolean;
  isEncrypted?: boolean;
  isDecrypted?: boolean;
  createdAt?: string;
}

export interface Conversation {
  id: string;
  name: string;
  description?: string | null;
  isPrivate?: boolean | number;
  createdBy?: string | null;
  createdAt?: string;
  lastMessage?: Message;
  unreadCount?: number;
  messageCount?: number;
}

export interface ChatResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export type UserStatusType = 'online' | 'away' | 'dnd';

export interface ActiveUser {
  socketId: string;
  userId?: string;
  username: string;
  publicKey?: any;
  rawPublicKey?: any;
  status: string;
}
