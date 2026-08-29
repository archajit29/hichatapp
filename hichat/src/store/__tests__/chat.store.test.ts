import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useChatStore,
  selectConversations,
  selectMessages,
  selectAllUsers,
  selectSelectedConversation,
  selectOnlineUsers,
  selectTypingUsers,
  selectChatLoading,
  selectChatError,
} from '../chat.store';
import * as chatApi from '../../api/chat';
import * as userApi from '../../api/users';

vi.mock('../../api/chat', () => ({
  fetchConversationsRequest: vi.fn(),
  fetchConversationByIdRequest: vi.fn(),
  fetchMessagesRequest: vi.fn(),
  sendMessageRequest: vi.fn(),
  deleteMessageRequest: vi.fn(),
  createRoomRequest: vi.fn(),
}));

vi.mock('../../api/users', () => ({
  fetchUsersRequest: vi.fn(),
}));

describe('chat.store', () => {
  beforeEach(() => {
    useChatStore.setState({
      conversations: [],
      allUsers: [],
      selectedConversation: null,
      messages: [],
      onlineUsers: [],
      typingUsers: [],
      loading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  it('initializes with empty chat state', () => {
    const state = useChatStore.getState();
    expect(state.conversations).toEqual([]);
    expect(state.messages).toEqual([]);
    expect(state.allUsers).toEqual([]);
    expect(state.selectedConversation).toBeNull();
  });

  it('fetches conversations successfully', async () => {
    const mockRooms = [
      { id: 'general', name: 'General', isPrivate: false },
      { id: 'security', name: 'Security', isPrivate: false },
    ];
    (chatApi.fetchConversationsRequest as any).mockResolvedValueOnce(mockRooms);

    const result = await useChatStore.getState().fetchConversations();
    expect(result).toEqual(mockRooms);
    expect(useChatStore.getState().conversations).toEqual(mockRooms);
    expect(useChatStore.getState().loading).toBe(false);
  });

  it('fetches messages for a channel', async () => {
    const mockMessages = [
      { id: 'm1', message: 'Hello', author: 'alice', createdAt: new Date() },
      { id: 'm2', message: 'Hi', author: 'bob', createdAt: new Date() },
    ];
    (chatApi.fetchMessagesRequest as any).mockResolvedValueOnce(mockMessages);

    const result = await useChatStore.getState().fetchMessages('general');
    expect(result).toEqual(mockMessages);
    expect(useChatStore.getState().messages).toEqual(mockMessages);
  });

  it('adds and updates message in store without duplication', () => {
    const msg1 = { id: 'm1', message: 'First', author: 'alice', createdAt: new Date() };
    const msg2 = { id: 'm2', message: 'Second', author: 'bob', createdAt: new Date() };

    useChatStore.getState().addMessage(msg1);
    expect(useChatStore.getState().messages).toHaveLength(1);

    // Duplicate add should be ignored
    useChatStore.getState().addMessage(msg1);
    expect(useChatStore.getState().messages).toHaveLength(1);

    useChatStore.getState().addMessage(msg2);
    expect(useChatStore.getState().messages).toHaveLength(2);

    // Update message
    useChatStore.getState().updateMessage({ ...msg1, message: 'Updated message' });
    expect(useChatStore.getState().messages[0].message).toBe('Updated message');
  });

  it('deletes message and marks it as deleted', async () => {
    const msg1 = { id: 'm1', message: 'Secret', author: 'alice', createdAt: new Date() };
    useChatStore.getState().addMessage(msg1);

    (chatApi.deleteMessageRequest as any).mockResolvedValueOnce({});
    await useChatStore.getState().deleteMessage('m1');

    const updated = useChatStore.getState().messages[0];
    expect(updated.isDeleted).toBe(true);
    expect(updated.message).toBe('[This message was deleted]');
  });

  it('selects conversation by id or clears it', () => {
    const rooms = [
      { id: 'room-a', name: 'Room A', isPrivate: false },
      { id: 'room-b', name: 'Room B', isPrivate: false },
    ];
    useChatStore.setState({ conversations: rooms });

    useChatStore.getState().selectConversation('room-b');
    expect(useChatStore.getState().selectedConversation?.id).toBe('room-b');

    useChatStore.getState().selectConversation(null);
    expect(useChatStore.getState().selectedConversation).toBeNull();
  });

  it('sets online and typing users', () => {
    useChatStore.getState().setOnlineUsers(['alice', 'bob']);
    expect(useChatStore.getState().onlineUsers).toEqual(['alice', 'bob']);

    useChatStore.getState().setTypingUsers(['charlie']);
    expect(useChatStore.getState().typingUsers).toEqual(['charlie']);
  });

  it('exports accurate granular selectors for chat store', () => {
    const mockState = {
      conversations: [{ id: '1', name: 'General', isPrivate: false }],
      messages: [{ id: 'm1', message: 'Test', author: 'alice' }],
      allUsers: [{ id: 'u1', username: 'alice' }],
      selectedConversation: { id: '1', name: 'General', isPrivate: false },
      onlineUsers: ['alice'],
      typingUsers: ['bob'],
      loading: true,
      error: 'Chat Error',
    } as any;

    expect(selectConversations(mockState)).toHaveLength(1);
    expect(selectMessages(mockState)).toHaveLength(1);
    expect(selectAllUsers(mockState)).toHaveLength(1);
    expect(selectSelectedConversation(mockState)?.name).toBe('General');
    expect(selectOnlineUsers(mockState)).toEqual(['alice']);
    expect(selectTypingUsers(mockState)).toEqual(['bob']);
    expect(selectChatLoading(mockState)).toBe(true);
    expect(selectChatError(mockState)).toBe('Chat Error');
  });
});
