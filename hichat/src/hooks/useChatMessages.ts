import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Message, ActiveUser } from '../types/chat';
import { User } from '../types/user';
import { useChats } from './useChats';
import { useUI } from './useUI';
import { useEncryption } from './useEncryption';
import { playMessageSound, playReactionSound } from '../soundUtils';
import { socket } from '../api/socket';

interface UseChatMessagesProps {
  authUser: User | null;
  cryptoKeys: any;
  currentRoomId: string;
  activeTab: 'channel' | 'dm';
  activeDMUser: User | null;
  activeUsersMap: Map<string, ActiveUser>;
  setActiveUsersMap: React.Dispatch<React.SetStateAction<Map<string, ActiveUser>>>;
  setUnreadCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

export function useChatMessages({
  authUser,
  cryptoKeys,
  currentRoomId,
  activeTab,
  activeDMUser,
  activeUsersMap,
  setActiveUsersMap,
  setUnreadCounts,
}: UseChatMessagesProps) {
  const navigate = useNavigate();
  const { messages, setMessages, fetchMessages } = useChats();
  const { soundEnabled } = useUI();
  const {
    decryptMessage,
    decryptChatPayload,
    importPublicKey,
  } = useEncryption(cryptoKeys?.store);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const processedMsgIdsRef = useRef<Set<string>>(new Set());
  const decryptQueueRef = useRef<Promise<void>>(Promise.resolve());

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Decrypt Message Payload using Signal Protocol Double Ratchet via useEncryption hook
  const processDecryption = useCallback(
    async (msgData: Message, keys: any): Promise<Message> => {
      return decryptChatPayload(msgData, authUser, keys?.store);
    },
    [authUser, decryptChatPayload]
  );

  // Fetch History Messages on Room/DM Switch
  useEffect(() => {
    if (authUser && currentRoomId) {
      fetchMessages(currentRoomId)
        .then(async (fetchedMsgs) => {
          const msgs = fetchedMsgs || [];
          if (msgs.length > 0 && cryptoKeys) {
            const decryptedList = await Promise.all(
              msgs.map(async (msg) => processDecryption(msg, cryptoKeys))
            );
            setMessages(decryptedList);
          } else if (msgs.length === 0) {
            setMessages([]);
          }
        })
        .catch(() => {});

      if (socket.connected) {
        socket.emit('switch_room', currentRoomId);
      }

      requestAnimationFrame(() => {
        setUnreadCounts((prev) => ({ ...prev, [currentRoomId]: 0 }));
      });
    }
  }, [currentRoomId, authUser, cryptoKeys, processDecryption, fetchMessages, setMessages, setUnreadCounts]);

  // Real-Time Socket Event Handlers
  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = async (msgData: any) => {
      if (cryptoKeys) {
        const decryptedMsg = await processDecryption(msgData, cryptoKeys);

        if (msgData.roomId === currentRoomId) {
          setMessages((prev) => [...prev, decryptedMsg]);
          if (msgData.author !== authUser?.username) {
            playMessageSound(soundEnabled);
          }
        } else {
          setUnreadCounts((prev) => ({
            ...prev,
            [msgData.roomId]: (prev[msgData.roomId] || 0) + 1,
          }));
          playMessageSound(soundEnabled);
        }
      }
    };

    const handleReceiveDirectMessage = (data: any) => {
      if (!data || !data.messageId) return;

      decryptQueueRef.current = decryptQueueRef.current
        .then(async () => {
          if (processedMsgIdsRef.current.has(data.messageId)) {
            if (socket.connected) {
              socket.emit('ack_direct_message', {
                mailboxId: data.mailboxId,
                messageId: data.messageId,
              });
            }
            return;
          }

          processedMsgIdsRef.current.add(data.messageId);

          if (cryptoKeys?.store) {
            try {
              const text = await decryptMessage(
                data.senderUsername,
                data.ciphertext,
                { store: cryptoKeys.store }
              );
              const dmRoomId = [authUser?.username, data.senderUsername].sort().join('_dm_');

              const newMsg: Message = {
                id: data.messageId,
                roomId: dmRoomId,
                senderId: data.senderId,
                author: data.senderUsername,
                message: text,
                status: 'acknowledged',
                time: new Date(data.timestamp || Date.now()).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                isEncrypted: true,
                isDecrypted: true,
              };

              setMessages((prev) => {
                if (prev.some((m) => m.id === data.messageId)) return prev;
                return [...prev, newMsg];
              });

              if (socket.connected) {
                socket.emit('ack_direct_message', {
                  mailboxId: data.mailboxId,
                  messageId: data.messageId,
                });
              }

              if (activeTab === 'dm' && activeDMUser?.username === data.senderUsername) {
                if (socket.connected) {
                  socket.emit('read_direct_message', {
                    messageId: data.messageId,
                    senderId: data.senderId,
                  });
                }
              } else {
                setUnreadCounts((prev) => ({
                  ...prev,
                  [dmRoomId]: (prev[dmRoomId] || 0) + 1,
                }));
              }

              playMessageSound(soundEnabled);
            } catch (err) {
              console.error(
                'Decryption failed for direct message from ' + data.senderUsername + ':',
                err
              );
            }
          }
        })
        .catch((queueErr) => {
          console.error('Decryption queue error:', queueErr);
        });
    };

    const handleMessageStatusUpdate = (data: any) => {
      if (!data?.messageId || !data?.status) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, status: data.status } : m))
      );
    };

    const handleForceDisconnect = (data: any) => {
      alert(data.reason || 'Signed out — session opened in another window/device.');
      localStorage.removeItem('hichat_jwt_token');
      localStorage.removeItem('hichat_refresh_token');
      localStorage.removeItem('hichat_user');
      socket.disconnect();
      navigate('/login');
    };

    const handleUserJoined = async (data: any) => {
      if (data.publicKey) {
        const pubKey = await importPublicKey(data.publicKey);
        setActiveUsersMap((prev) =>
          new Map(prev).set(data.socketId, {
            socketId: data.socketId,
            userId: data.userId,
            username: data.username,
            publicKey: pubKey,
            rawPublicKey: data.publicKey,
            status: data.status || 'online',
          })
        );
      }
    };

    const handleExistingUsers = async (usersList: any[]) => {
      const newMap = new Map<string, ActiveUser>();
      for (const u of usersList) {
        if (u.publicKey) {
          const pubKey = await importPublicKey(u.publicKey);
          newMap.set(u.socketId, {
            socketId: u.socketId,
            userId: u.userId,
            username: u.username,
            publicKey: pubKey,
            rawPublicKey: u.publicKey,
            status: u.status || 'online',
          });
        }
      }
      setActiveUsersMap(newMap);
    };

    const handleUserLeft = (data: any) => {
      setActiveUsersMap((prev) => {
        const next = new Map(prev);
        next.delete(data.socketId);
        return next;
      });
    };

    const handlePresenceUpdate = (usersList: any[]) => {
      usersList.forEach((u) => {
        if (u.socketId && activeUsersMap.has(u.socketId)) {
          const existing = activeUsersMap.get(u.socketId)!;
          activeUsersMap.set(u.socketId, { ...existing, status: u.status });
        }
      });
      setActiveUsersMap(new Map(activeUsersMap));
    };

    const handleReaction = (data: any) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === data.messageId) {
            const reactions = { ...(msg.reactions || {}) };
            reactions[data.emoji] = (reactions[data.emoji] || 0) + 1;
            return { ...msg, reactions };
          }
          return msg;
        })
      );
      playReactionSound(soundEnabled);
    };

    const handleMessageDeleted = (data: any) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId
            ? { ...msg, isDeleted: true, message: '[This message was deleted]' }
            : msg
        )
      );
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('receive_direct_message', handleReceiveDirectMessage);
    socket.on('message_status_update', handleMessageStatusUpdate);
    socket.on('force_disconnect', handleForceDisconnect);
    socket.on('user_joined', handleUserJoined);
    socket.on('existing_users', handleExistingUsers);
    socket.on('user_left', handleUserLeft);
    socket.on('presence_update', handlePresenceUpdate);
    socket.on('message_reaction', handleReaction);
    socket.on('message_deleted', handleMessageDeleted);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('receive_direct_message', handleReceiveDirectMessage);
      socket.off('message_status_update', handleMessageStatusUpdate);
      socket.off('force_disconnect', handleForceDisconnect);
      socket.off('user_joined', handleUserJoined);
      socket.off('existing_users', handleExistingUsers);
      socket.off('user_left', handleUserLeft);
      socket.off('presence_update', handlePresenceUpdate);
      socket.off('message_reaction', handleReaction);
      socket.off('message_deleted', handleMessageDeleted);
    };
  }, [
    cryptoKeys,
    authUser,
    currentRoomId,
    soundEnabled,
    activeUsersMap,
    activeDMUser?.username,
    activeTab,
    navigate,
    processDecryption,
    decryptMessage,
    importPublicKey,
    setMessages,
    setActiveUsersMap,
    setUnreadCounts,
  ]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const filteredMessages = messages.filter((msg) => {
    if (!searchQuery) return true;
    return (
      (msg.message || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (msg.author || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return {
    messages,
    filteredMessages,
    searchQuery,
    setSearchQuery,
    lightboxImage,
    setLightboxImage,
    messagesEndRef,
    scrollToBottom,
    processDecryption,
    processedMsgIdsRef,
  };
}
