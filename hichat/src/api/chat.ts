import { apiClient } from './client';
import { Conversation, Message } from '../types/chat';

export const fetchConversationsRequest = async (): Promise<Conversation[]> => {
  const { data } = await apiClient.get<{ success?: boolean; data?: Conversation[]; rooms?: Conversation[] }>('/rooms');
  if (data && Array.isArray(data.data)) {
    return data.data;
  }
  if (data && Array.isArray(data.rooms)) {
    return data.rooms;
  }
  if (Array.isArray(data)) {
    return data;
  }
  return [];
};

export const fetchConversationByIdRequest = async (roomId: string): Promise<Conversation | null> => {
  try {
    const { data } = await apiClient.get<{ success?: boolean; data?: Conversation; room?: Conversation }>(`/rooms/${roomId}`);
    if (data && data.data) return data.data;
    if (data && data.room) return data.room;
    if (data && typeof data === 'object' && 'id' in data) return data as unknown as Conversation;
    return null;
  } catch (_err) {
    const allRooms = await fetchConversationsRequest();
    return allRooms.find((r) => r.id === roomId) || null;
  }
};

export const fetchMessagesRequest = async (roomId: string, limit: number = 100): Promise<Message[]> => {
  try {
    const { data } = await apiClient.get<{ success?: boolean; data?: Message[]; messages?: Message[] }>(`/rooms/${roomId}/messages`, {
      params: { limit },
    });
    if (data && Array.isArray(data.data)) return data.data;
    if (data && Array.isArray(data.messages)) return data.messages;
    if (Array.isArray(data)) return data;
    return [];
  } catch (_err) {
    const { data } = await apiClient.get<{ success?: boolean; data?: Message[]; messages?: Message[] }>(`/messages/${roomId}`, {
      params: { limit },
    });
    if (data && Array.isArray(data.data)) return data.data;
    if (data && Array.isArray(data.messages)) return data.messages;
    if (Array.isArray(data)) return data;
    return [];
  }
};

export const createRoomRequest = async (payload: { name: string; description?: string }): Promise<Conversation> => {
  const { data } = await apiClient.post<{ success?: boolean; data?: Conversation; room?: Conversation }>('/rooms', payload);
  if (data && data.data) return data.data;
  if (data && data.room) return data.room;
  return data as unknown as Conversation;
};

export const sendMessageRequest = async (roomId: string, payload: any): Promise<Message> => {
  try {
    const { data } = await apiClient.post<{ success?: boolean; data?: Message; message?: Message }>(`/rooms/${roomId}/messages`, payload);
    if (data && data.data) return data.data;
    if (data && data.message) return data.message;
    return data as unknown as Message;
  } catch (_err) {
    const { data } = await apiClient.post<{ success?: boolean; data?: Message; message?: Message }>(`/messages/${roomId}`, payload);
    if (data && data.data) return data.data;
    if (data && data.message) return data.message;
    return data as unknown as Message;
  }
};

export const deleteMessageRequest = async (messageId: string): Promise<void> => {
  await apiClient.delete(`/messages/${messageId}`);
};

export const fetchStatsRequest = async (): Promise<{
  success: boolean;
  usersCount?: number;
  roomsCount?: number;
  messagesCount?: number;
  [key: string]: any;
}> => {
  const { data } = await apiClient.get('/stats');
  return data;
};
