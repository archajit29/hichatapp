export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  public_key: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  description: string | null;
  is_private: number;
  created_by: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  sender_username: string;
  payloads: string;
  media_url: string | null;
  file_name: string | null;
  file_size: number | null;
  is_edited: number;
  is_deleted: number;
  created_at: string;
}

export interface UserDevice {
  id: string;
  user_id: string;
  device_id: number;
  registration_id: number;
  identity_key: string;
  created_at: string;
  updated_at: string;
}

export interface SignedPreKey {
  id: string;
  user_id: string;
  device_id: number;
  key_id: number;
  public_key: string;
  signature: string;
  created_at: string;
}

export interface OneTimePreKey {
  id: string;
  user_id: string;
  device_id: number;
  key_id: number;
  public_key: string;
  created_at: string;
}

export interface MailboxItem {
  id: number;
  message_id: string;
  recipient_id: string;
  sender_id: string;
  sender_username: string;
  ciphertext: string;
  status: string;
  delivered_at: string | null;
  acknowledged_at: string | null;
  read_at: string | null;
  created_at: string;
  attempt_count?: number;
  last_attempt_at?: string | null;
  next_retry_at?: string | null;
}

export interface MessageDelivery {
  message_id: string;
  sender_id: string;
  recipient_id: string;
  status: string;
  queued_at: string;
  delivered_at: string | null;
  acknowledged_at: string | null;
  read_at: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  parent_token_id: string | null;
  is_revoked: number;
  replaced_by: string | null;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
}

