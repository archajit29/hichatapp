import { useChatStore } from '../store/chat.store';

export const useChats = () => {
  const conversations = useChatStore((state) => state.conversations);
  const allUsers = useChatStore((state) => state.allUsers);
  const selectedConversation = useChatStore((state) => state.selectedConversation);
  const messages = useChatStore((state) => state.messages);
  const onlineUsers = useChatStore((state) => state.onlineUsers);
  const typingUsers = useChatStore((state) => state.typingUsers);
  const loading = useChatStore((state) => state.loading);
  const error = useChatStore((state) => state.error);
  const fetchConversations = useChatStore((state) => state.fetchConversations);
  const fetchConversationById = useChatStore((state) => state.fetchConversationById);
  const fetchUsers = useChatStore((state) => state.fetchUsers);
  const fetchMessages = useChatStore((state) => state.fetchMessages);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const deleteMessage = useChatStore((state) => state.deleteMessage);
  const setMessages = useChatStore((state) => state.setMessages);
  const setConversations = useChatStore((state) => state.setConversations);
  const setAllUsers = useChatStore((state) => state.setAllUsers);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const createRoom = useChatStore((state) => state.createRoom);
  const clearMessages = useChatStore((state) => state.clearMessages);
  const setOnlineUsers = useChatStore((state) => state.setOnlineUsers);
  const setTypingUsers = useChatStore((state) => state.setTypingUsers);
  const setLoading = useChatStore((state) => state.setLoading);
  const setError = useChatStore((state) => state.setError);

  return {
    conversations,
    allUsers,
    selectedConversation,
    messages,
    onlineUsers,
    typingUsers,
    loading,
    error,
    fetchConversations,
    fetchConversationById,
    fetchUsers,
    fetchMessages,
    sendMessage,
    addMessage,
    updateMessage,
    deleteMessage,
    setMessages,
    setConversations,
    setAllUsers,
    selectConversation,
    createRoom,
    clearMessages,
    setOnlineUsers,
    setTypingUsers,
    setLoading,
    setError,
  };
};
