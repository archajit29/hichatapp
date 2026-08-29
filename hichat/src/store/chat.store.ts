import { create } from 'zustand';
import { Conversation, Message } from '../types/chat';
import { User } from '../types/user';
import {
  fetchConversationsRequest,
  fetchConversationByIdRequest,
  fetchMessagesRequest,
  sendMessageRequest,
  deleteMessageRequest,
  createRoomRequest,
} from '../api/chat';
import { fetchUsersRequest } from '../api/users';

export interface ChatState {
  conversations: Conversation[];
  allUsers: User[];
  selectedConversation: Conversation | null;
  messages: Message[];
  onlineUsers: string[];
  typingUsers: string[];
  loading: boolean;
  error: string | null;

  fetchConversations: () => Promise<Conversation[]>;
  fetchConversationById: (chatId: string) => Promise<Conversation | null>;
  fetchUsers: () => Promise<User[]>;
  fetchMessages: (chatId: string) => Promise<Message[]>;
  sendMessage: (chatId: string, message: any) => Promise<Message | void>;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  deleteMessage: (messageId: string) => Promise<void>;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setConversations: (conversations: Conversation[] | ((prev: Conversation[]) => Conversation[])) => void;
  setAllUsers: (users: User[] | ((prev: User[]) => User[])) => void;
  selectConversation: (chatId: string | null) => void;
  createRoom: (payload: { name: string; description?: string }) => Promise<Conversation | void>;
  clearMessages: () => void;
  setOnlineUsers: (users: string[]) => void;
  setTypingUsers: (users: string[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  allUsers: [],
  selectedConversation: null,
  messages: [],
  onlineUsers: [],
  typingUsers: [],
  loading: false,
  error: null,

  fetchConversations: async () => {
    set({ loading: true, error: null });
    try {
      const rooms = await fetchConversationsRequest();
      set({ conversations: rooms, loading: false });
      return rooms;
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to fetch conversations';
      set({
        error: errorMessage,
        loading: false,
      });
      return [];
    }
  },

  fetchConversationById: async (chatId: string) => {
    set({ loading: true, error: null });
    try {
      const conversation = await fetchConversationByIdRequest(chatId);
      if (conversation) {
        set((state) => {
          const exists = state.conversations.some((c) => c.id === conversation.id);
          return {
            conversations: exists
              ? state.conversations.map((c) => (c.id === conversation.id ? conversation : c))
              : [...state.conversations, conversation],
            selectedConversation: conversation,
            loading: false,
          };
        });
        return conversation;
      }
      set({ loading: false });
      return null;
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to fetch conversation';
      set({
        error: errorMessage,
        loading: false,
      });
      return null;
    }
  },

  fetchUsers: async () => {
    try {
      const response = await fetchUsersRequest();
      set({ allUsers: response.users });
      return response.users;
    } catch (err: any) {
      console.error('Failed to fetch users', err);
      return [];
    }
  },

  fetchMessages: async (chatId: string) => {
    set({ loading: true, error: null });
    try {
      const messages = await fetchMessagesRequest(chatId);
      set({ messages, loading: false });
      return messages;
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to fetch messages';
      set({
        error: errorMessage,
        loading: false,
      });
      return [];
    }
  },

  sendMessage: async (chatId: string, message: any) => {
    try {
      const newMessage = await sendMessageRequest(chatId, message);
      if (newMessage) {
        get().addMessage(newMessage);
        return newMessage;
      }
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to send message';
      set({ error: errorMessage });
      throw err;
    }
  },

  addMessage: (message: Message) => {
    set((state) => {
      if (state.messages.some((msg) => msg.id === message.id)) {
        return state;
      }
      return { messages: [...state.messages, message] };
    });
  },

  updateMessage: (message: Message) => {
    set((state) => ({
      messages: state.messages.map((msg) => (msg.id === message.id ? { ...msg, ...message } : msg)),
    }));
  },

  deleteMessage: async (messageId: string) => {
    try {
      await deleteMessageRequest(messageId);
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === messageId ? { ...msg, isDeleted: true, message: '[This message was deleted]' } : msg
        ),
      }));
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to delete message';
      set({ error: errorMessage });
    }
  },

  setMessages: (messagesOrUpdater) => {
    set((state) => ({
      messages:
        typeof messagesOrUpdater === 'function'
          ? messagesOrUpdater(state.messages)
          : messagesOrUpdater,
    }));
  },

  setConversations: (conversationsOrUpdater) => {
    set((state) => ({
      conversations:
        typeof conversationsOrUpdater === 'function'
          ? conversationsOrUpdater(state.conversations)
          : conversationsOrUpdater,
    }));
  },

  setAllUsers: (usersOrUpdater) => {
    set((state) => ({
      allUsers:
        typeof usersOrUpdater === 'function'
          ? usersOrUpdater(state.allUsers)
          : usersOrUpdater,
    }));
  },

  selectConversation: (chatId: string | null) => {
    if (chatId === null) {
      set({ selectedConversation: null });
      return;
    }
    const conversation = get().conversations.find((c) => c.id === chatId) || null;
    set({ selectedConversation: conversation });
  },

  createRoom: async (payload: { name: string; description?: string }) => {
    set({ loading: true, error: null });
    try {
      const newRoom = await createRoomRequest(payload);
      set((state) => {
        const exists = state.conversations.some((c) => c.id === newRoom.id);
        return {
          conversations: exists ? state.conversations : [...state.conversations, newRoom],
          selectedConversation: newRoom,
          loading: false,
        };
      });
      return newRoom;
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to create room';
      set({ error: errorMessage, loading: false });
      throw err;
    }
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  setOnlineUsers: (users: string[]) => {
    set({ onlineUsers: users });
  },

  setTypingUsers: (users: string[]) => {
    set({ typingUsers: users });
  },

  setLoading: (loading: boolean) => set({ loading }),
  setError: (error: string | null) => set({ error }),
}));
