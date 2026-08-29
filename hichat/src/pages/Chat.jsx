import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';
import { useChats } from '../hooks/useChats';
import { useUI } from '../hooks/useUI';
import {
  loadOrGenerateUserKeys,
  importPublicKey,
  encryptMessage,
  decryptMessage,
  getPublicKeyFingerprint,
  generateSignalPreKeyBundle
} from '../cryptoUtils';
import { getKeyCountRequest, uploadKeysRequest, getKeyBundleRequest } from '../api/keys';
import {
  playMessageSound,
  playSendSound,
  playReactionSound,
  playRecordStartSound
} from '../soundUtils';
import {
  ShieldCheck,
  Lock,
  Send,
  Plus,
  Hash,
  User,
  LogOut,
  Volume2,
  VolumeX,
  Paperclip,
  Users,
  Key,
  Search,
  Sparkles,
  CheckCheck,
  MessageSquare,
  Trash2,
  Copy,
  ChevronDown,
  FileText,
  Radio,
  Globe,
  Smile,
  Mic,
  MicOff,
  CornerDownRight,
  Pin,
  X,
  Play,
  Pause,
  ExternalLink,
  Code,
  Sliders,
  Maximize2,
  Info,
  Check,
  Menu
} from 'lucide-react';
import '../App.css';

const SERVER_URL = 'http://localhost:3001';
const socket = io(SERVER_URL, { autoConnect: false });

const EMOJI_REACTIONS = ['👍', '❤️', '🔥', '🚀', '🎉', '👏', '😮', '😂', '👀', '💎'];

// Markdown Parser Helper for Code Blocks & Links
function formatMessageContent(content) {
  if (!content) return null;

  const codeBlockRegex = /```([a-zA-Z]*)\n([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.substring(lastIndex, match.index) });
    }
    parts.push({ type: 'codeblock', lang: match[1] || 'code', value: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.substring(lastIndex) });
  }

  return (
    <div className="space-y-2">
      {parts.map((part, pIdx) => {
        if (part.type === 'codeblock') {
          return (
            <div key={pIdx} className="rounded-xl overflow-hidden bg-black/60 border border-white/10 my-2 font-mono text-xs shadow-inner">
              <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/10 text-gray-400">
                <span className="text-[11px] font-semibold uppercase">{part.lang}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(part.value)}
                  className="hover:text-white flex items-center gap-1 text-[10px] bg-white/10 px-2 py-0.5 rounded transition cursor-pointer"
                  title="Copy code"
                >
                  <Copy size={10} /> Copy
                </button>
              </div>
              <pre className="p-3 overflow-x-auto text-emerald-300">
                <code>{part.value}</code>
              </pre>
            </div>
          );
        }

        const lines = part.value.split('\n');
        return (
          <div key={pIdx} className="space-y-1">
            {lines.map((line, lIdx) => {
              const urlRegex = /(https?:\/\/[^\s]+)/g;
              const lineParts = line.split(urlRegex);

              return (
                <p key={lIdx} className="leading-relaxed">
                  {lineParts.map((sub, sIdx) => {
                    if (sub.match(urlRegex)) {
                      return (
                        <a
                          key={sIdx}
                          href={sub}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 underline inline-flex items-center gap-0.5"
                        >
                          {sub} <ExternalLink size={11} />
                        </a>
                      );
                    }
                    return <span key={sIdx}>{sub}</span>;
                  })}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Audio Player Component for Voice Notes
function AudioMessagePlayer({ audioUrl }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState('0:00');
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      const mins = Math.floor(audio.duration / 60);
      const secs = Math.floor(audio.duration % 60).toString().padStart(2, '0');
      setDuration(`${mins}:${secs}`);
    };

    audio.ontimeupdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    audio.onended = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    return () => {
      audio.pause();
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-black/40 border border-white/10 my-1.5 w-64 max-w-full">
      <button
        type="button"
        onClick={togglePlay}
        className="w-9 h-9 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md hover:scale-105 transition shrink-0 cursor-pointer"
      >
        {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
      </button>

      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-0.5 h-4">
          {[40, 70, 90, 60, 100, 50, 80, 65, 45, 95, 75, 55, 85, 30].map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-full transition-all duration-150 ${
                isPlaying ? 'bg-cyan-400' : 'bg-gray-600'
              }`}
              style={{
                height: isPlaying ? `${Math.max(20, (h * (progress + 20)) % 100)}%` : `${h * 0.4}%`,
                opacity: (i / 14) * 100 <= progress ? 1 : 0.4
              }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 font-mono">
          <span>Voice Note</span>
          <span>{duration}</span>
        </div>
      </div>
    </div>
  );
}

export default function Chat() {
  const navigate = useNavigate();

  // Global State Hooks
  const { 
    user: authUser, 
    accessToken: _accessToken, 
    logout: _logout, 
    cryptoKeys, 
    setCryptoKeys, 
    fingerprint: myFingerprint, 
    setFingerprint: setMyFingerprint,
    setUser
  } = useAuth();
  const { 
    conversations: rooms, 
    allUsers, 
    messages, 
    loading: _chatLoading,
    error: _chatError,
    setMessages,
    setConversations: setRooms,
    setAllUsers: _setAllUsers,
    fetchConversations, 
    fetchConversationById: _fetchConversationById,
    fetchUsers, 
    fetchMessages,
    sendMessage: _sendMessageAction,
    addMessage: _addMessage,
    updateMessage: _updateMessage,
    deleteMessage,
    selectConversation,
    createRoom,
    clearMessages,
    setLoading: _setLoading,
    setError: _setError,
  } = useChats();
  const {
    sidebarOpen: isSidebarOpen,
    setIsSidebarOpen,
    toggleSidebar: _toggleSidebar,
    rightDrawerOpen: isRightDrawerOpen,
    setIsRightDrawerOpen,
    toggleRightDrawer: _toggleRightDrawer,
    soundEnabled,
    toggleSound: _toggleSound,
    setSoundEnabled,
    activeModal,
    openModal,
    closeModal
  } = useUI();

  // Presence State
  const [userStatus, setUserStatus] = useState('online'); // 'online' | 'away' | 'dnd'
  const [statusDropdown, setStatusDropdown] = useState(false);

  // Channels & DMs
  const [activeTab, setActiveTab] = useState('channel'); // 'channel' | 'dm'
  const [activeRoom, setActiveRoom] = useState('general');
  const [activeDMUser, setActiveDMUser] = useState(null);

  // Note: rooms and allUsers are now coming from useChats hook

  const [activeUsersMap, setActiveUsersMap] = useState(new Map());
  const [unreadCounts, setUnreadCounts] = useState({});

  // Chat Feed State
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [encryptedFilePayload, setEncryptedFilePayload] = useState(null);

  // Advanced Messaging Features
  const [replyingTo, setReplyingTo] = useState(null);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [showPinnedBanner, setShowPinnedBanner] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // UI state derived from global UI store or kept local if very specific
  const createRoomModal = activeModal === 'createRoom';
  const setCreateRoomModal = (val) => val ? openModal('createRoom') : closeModal();
  
  const [newRoomData, setNewRoomData] = useState({ name: '', description: '' });
  const [keyModalUser, setKeyModalUser] = useState(null);
  const [typingStatus, setTypingStatus] = useState(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState(null);
  const [showCommandsHelp, setShowCommandsHelp] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const processedMsgIdsRef = useRef(new Set());
  const decryptQueueRef = useRef(Promise.resolve());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Decrypt Message Payload using Signal Protocol Double Ratchet
  const processDecryption = useCallback(async (msgData, keys) => {
    if (msgData.isDeleted) return { ...msgData, message: '[This message was deleted]', isDeleted: true };

    try {
      const payloads = msgData.payloads || {};
      const targetCiphertext = (authUser?.username && payloads[authUser.username]) ||
                               (socket?.id && payloads[socket.id]) ||
                               (authUser?.id && payloads[authUser.id]) ||
                               (authUser?.id && payloads[String(authUser.id)]) ||
                               payloads['all'];

      if (msgData.author === authUser?.username) {
        return { ...msgData, isEncrypted: true, isDecrypted: true };
      }

      if (!targetCiphertext) {
        if (msgData.message) return { ...msgData, isEncrypted: true };
        return { ...msgData, message: '[Encrypted Message]', isEncrypted: true };
      }

      if (keys?.store && msgData.author) {
        const text = await decryptMessage(keys.store, msgData.author, targetCiphertext);
        return { ...msgData, message: text, isEncrypted: true, isDecrypted: true };
      } else if (msgData.message) {
        return { ...msgData, isEncrypted: true };
      } else {
        return { ...msgData, message: '[Encrypted Message]', isEncrypted: true };
      }
    } catch (_err) {
      console.warn('Decryption error for message from ' + msgData.author + ':', _err);
      if (msgData.message) return { ...msgData, isEncrypted: true };
      return { ...msgData, message: '[Encrypted Message]', isEncrypted: true };
    }
  }, [authUser]);

  // Initialize Signal Protocol Vault
  const initCryptoForUser = useCallback(async (userObj, token) => {
    try {
      const username = typeof userObj === 'string' ? userObj : userObj.username;
      const userId = typeof userObj === 'object' ? userObj.id : authUser?.id;
      const keys = await loadOrGenerateUserKeys(username);
      setCryptoKeys(keys);
      const print = await getPublicKeyFingerprint(keys.publicKeyJwk);
      setMyFingerprint(print);

      if (token) {
        try {
          let needsUpload = false;
          try {
            const countData = await getKeyCountRequest(username, 1);
            if (!countData || countData.remainingPreKeys === 0) {
              needsUpload = true;
            }
          } catch {
            needsUpload = true;
          }

          if (needsUpload) {
            const bundle = await generateSignalPreKeyBundle(keys.store, 1, 1, 20);
            await uploadKeysRequest({
              registrationId: bundle.registrationId,
              identityKey: bundle.identityKey,
              signedPreKey: bundle.signedPreKey,
              oneTimePreKeys: bundle.oneTimePreKeys,
              deviceId: 1,
            });
          }
        } catch (keySyncErr) {
          console.warn('Key bundle sync warning:', keySyncErr);
        }
      }

      if (token) {
        socket.auth = { token };
      }
      socket.connect();
      socket.emit('join', {
        userId: userId,
        username: username,
        publicKey: keys.publicKeyJwk,
        room: activeRoom,
        status: userStatus
      });
    } catch (_err) {
      console.error('Failed initializing crypto:', _err);
    }
  }, [activeRoom, authUser, setCryptoKeys, setMyFingerprint, userStatus]);

  // Restore stored user session
  useEffect(() => {
    const storedToken = localStorage.getItem('hichat_jwt_token');
    const storedUser = localStorage.getItem('hichat_user');
    if (storedToken && storedUser) {
      try {
        const u = JSON.parse(storedUser);
        setUser(u);
        initCryptoForUser(u, storedToken);
      } catch {
        localStorage.removeItem('hichat_jwt_token');
        localStorage.removeItem('hichat_user');
        navigate('/login');
      }
    } else {
      navigate('/login');
    }
  }, [initCryptoForUser, navigate, setUser]);

  // Fetch Rooms & Users from Zustand Store
  useEffect(() => {
    if (authUser) {
      fetchConversations().catch(err => console.warn('Rooms fetch fallback:', err));
      fetchUsers().catch(err => console.warn('Users fetch fallback:', err));
    }
  }, [authUser, fetchConversations, fetchUsers]);

  const currentRoomId = activeTab === 'channel'
    ? activeRoom
    : (activeDMUser ? [authUser?.username, activeDMUser?.username].sort().join('_dm_') : activeRoom);

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
        setUnreadCounts(prev => ({ ...prev, [currentRoomId]: 0 }));
      });
    }
  }, [currentRoomId, authUser, cryptoKeys, processDecryption, fetchMessages, setMessages]);

  // Real-Time Socket Event Handlers
  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = async (msgData) => {
      if (cryptoKeys) {
        const decryptedMsg = await processDecryption(msgData, cryptoKeys);

        if (msgData.roomId === currentRoomId) {
          setMessages((prev) => [...prev, decryptedMsg]);
          if (msgData.author !== authUser?.username) {
            playMessageSound(soundEnabled);
          }
        } else {
          setUnreadCounts(prev => ({
            ...prev,
            [msgData.roomId]: (prev[msgData.roomId] || 0) + 1
          }));
          playMessageSound(soundEnabled);
        }
      }
    };

    const handleReceiveDirectMessage = (data) => {
      if (!data || !data.messageId) return;

      decryptQueueRef.current = decryptQueueRef.current.then(async () => {
        // Duplicate prevention: If message was already decrypted, acknowledge to purge mailbox and return
        if (processedMsgIdsRef.current.has(data.messageId)) {
          if (socket.connected) {
            socket.emit('ack_direct_message', { mailboxId: data.mailboxId, messageId: data.messageId });
          }
          return;
        }

        processedMsgIdsRef.current.add(data.messageId);

        if (cryptoKeys?.store) {
          try {
            const text = await decryptMessage(cryptoKeys.store, data.senderUsername, data.ciphertext);
            const dmRoomId = [authUser?.username, data.senderUsername].sort().join('_dm_');

            const newMsg = {
              id: data.messageId,
              roomId: dmRoomId,
              senderId: data.senderId,
              author: data.senderUsername,
              message: text,
              status: 'acknowledged',
              time: new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isEncrypted: true,
              isDecrypted: true
            };

            setMessages((prev) => {
              if (prev.some(m => m.id === data.messageId)) return prev;
              return [...prev, newMsg];
            });

            // Confirm decryption & purge mailbox entry
            if (socket.connected) {
              socket.emit('ack_direct_message', { mailboxId: data.mailboxId, messageId: data.messageId });
            }

            // If currently viewing active DM with sender, immediately mark as read
            if (activeTab === 'dm' && activeDMUser?.username === data.senderUsername) {
              if (socket.connected) {
                socket.emit('read_direct_message', { messageId: data.messageId, senderId: data.senderId });
              }
            } else {
              setUnreadCounts(prev => ({
                ...prev,
                [dmRoomId]: (prev[dmRoomId] || 0) + 1
              }));
            }

            playMessageSound(soundEnabled);
          } catch (err) {
            console.error('Decryption failed for direct message from ' + data.senderUsername + ':', err);
          }
        }
      }).catch(queueErr => {
        console.error('Decryption queue error:', queueErr);
      });
    };

    const handleMessageStatusUpdate = (data) => {
      if (!data?.messageId || !data?.status) return;
      setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, status: data.status } : m));
    };

    const handleForceDisconnect = (data) => {
      alert(data.reason || 'Signed out — session opened in another window/device.');
      localStorage.removeItem('hichat_jwt_token');
      localStorage.removeItem('hichat_refresh_token');
      localStorage.removeItem('hichat_user');
      socket.disconnect();
      navigate('/login');
    };

    const handleUserJoined = async (data) => {
      if (data.publicKey) {
        const pubKey = await importPublicKey(data.publicKey);
        setActiveUsersMap(prev => new Map(prev).set(data.socketId, {
          socketId: data.socketId,
          userId: data.userId,
          username: data.username,
          publicKey: pubKey,
          rawPublicKey: data.publicKey,
          status: data.status || 'online'
        }));
      }
    };

    const handleExistingUsers = async (usersList) => {
      const newMap = new Map();
      for (const u of usersList) {
        if (u.publicKey) {
          const pubKey = await importPublicKey(u.publicKey);
          newMap.set(u.socketId, {
            socketId: u.socketId,
            userId: u.userId,
            username: u.username,
            publicKey: pubKey,
            rawPublicKey: u.publicKey,
            status: u.status || 'online'
          });
        }
      }
      setActiveUsersMap(newMap);
    };

    const handleUserLeft = (data) => {
      setActiveUsersMap(prev => {
        const next = new Map(prev);
        next.delete(data.socketId);
        return next;
      });
    };

    const handlePresenceUpdate = (usersList) => {
      usersList.forEach(u => {
        if (u.socketId && activeUsersMap.has(u.socketId)) {
          const existing = activeUsersMap.get(u.socketId);
          activeUsersMap.set(u.socketId, { ...existing, status: u.status });
        }
      });
      setActiveUsersMap(new Map(activeUsersMap));
    };

    const handleUserTyping = (data) => {
      if (data.roomId === currentRoomId) {
        setTypingStatus(prev => {
          const next = new Set(prev);
          if (data.isTyping && data.username !== authUser?.username) {
            next.add(data.username);
          } else {
            next.delete(data.username);
          }
          return next;
        });
      }
    };

    const handleReaction = (data) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === data.messageId) {
          const reactions = { ...(msg.reactions || {}) };
          reactions[data.emoji] = (reactions[data.emoji] || 0) + 1;
          return { ...msg, reactions };
        }
        return msg;
      }));
      playReactionSound(soundEnabled);
    };

    const handleMessageDeleted = (data) => {
      setMessages(prev => prev.map(msg => msg.id === data.messageId ? { ...msg, isDeleted: true } : msg));
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('receive_direct_message', handleReceiveDirectMessage);
    socket.on('message_status_update', handleMessageStatusUpdate);
    socket.on('force_disconnect', handleForceDisconnect);
    socket.on('user_joined', handleUserJoined);
    socket.on('existing_users', handleExistingUsers);
    socket.on('user_left', handleUserLeft);
    socket.on('presence_update', handlePresenceUpdate);
    socket.on('user_typing', handleUserTyping);
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
      socket.off('user_typing', handleUserTyping);
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
    setMessages
  ]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleLogout = () => {
    localStorage.removeItem('hichat_jwt_token');
    localStorage.removeItem('hichat_refresh_token');
    localStorage.removeItem('hichat_user');
    socket.disconnect();
    navigate('/login');
  };

  const handleStatusChange = (status) => {
    setUserStatus(status);
    setStatusDropdown(false);
    if (socket.connected) {
      socket.emit('update_status', status);
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (socket.connected) {
      socket.emit('typing_start', { username: authUser?.username, roomId: currentRoomId });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing_stop', { username: authUser?.username, roomId: currentRoomId });
      }, 2000);
    }
  };

  const handleFileSelection = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setEncryptedFilePayload(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Voice Note Recording Handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setEncryptedFilePayload(reader.result);
          setSelectedFile({ name: `voice_note_${Date.now()}.webm`, size: audioBlob.size, isAudio: true });
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingDuration(0);
      playRecordStartSound(soundEnabled);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch {
      alert('Microphone access is required to record voice notes.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      setSelectedFile(null);
      setEncryptedFilePayload(null);
    }
  };

  // Reaction Handler
  const handleAddReaction = (messageId, emoji) => {
    setActiveReactionPickerId(null);

    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const reactions = { ...(msg.reactions || {}) };
        reactions[emoji] = (reactions[emoji] || 0) + 1;
        return { ...msg, reactions };
      }
      return msg;
    }));

    playReactionSound(soundEnabled);

    if (socket.connected) {
      socket.emit('add_reaction', {
        messageId,
        emoji,
        username: authUser.username,
        roomId: currentRoomId
      });
    }
  };

  // Slash Command Checker
  const processSlashCommand = (cmdText) => {
    const parts = cmdText.trim().split(' ');
    const command = parts[0].toLowerCase();

    if (command === '/help') {
      setShowCommandsHelp(true);
      return true;
    }
    if (command === '/clear') {
      clearMessages();
      return true;
    }
    if (command === '/shrug') {
      setInput('¯\\_(ツ)_/¯');
      return false;
    }
    if (command === '/flip') {
      setInput('(╯°□°)╯︵ ┻━┻');
      return false;
    }
    if (command === '/keys') {
      setKeyModalUser({ username: authUser.username, fingerprint: myFingerprint });
      return true;
    }
    if (command === '/status') {
      const statusArg = parts[1]?.toLowerCase();
      if (['online', 'away', 'dnd'].includes(statusArg)) {
        handleStatusChange(statusArg);
        return true;
      }
    }
    return false;
  };

  // Send Encrypted Message
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();

    if (input.startsWith('/')) {
      const intercepted = processSlashCommand(input);
      if (intercepted) {
        setInput('');
        return;
      }
    }

    if ((!input.trim() && !encryptedFilePayload) || !cryptoKeys || !authUser) {
      return;
    }

    const textToSend = input.trim() || `[Attachment: ${selectedFile?.name || 'media'}]`;
    const payloads = {};

    if (activeTab === 'dm' && activeDMUser) {
      const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      let enc;

      try {
        const session = await cryptoKeys.store.loadSession(activeDMUser.username + '.1');
        if (!session) {
          const bundleData = await getKeyBundleRequest(activeDMUser.username, 1);
          if (bundleData && !bundleData.error) {
            enc = await encryptMessage(cryptoKeys.store, activeDMUser.username, textToSend, { preKeyBundle: bundleData });
          } else {
            console.error(`Could not fetch PreKey bundle for ${activeDMUser.username}:`, bundleData?.error);
            return;
          }
        } else {
          enc = await encryptMessage(cryptoKeys.store, activeDMUser.username, textToSend);
        }

        if (enc) {
          const localMsg = {
            id: messageId,
            roomId: currentRoomId,
            senderId: authUser.id,
            author: authUser.username,
            message: textToSend,
            status: 'queued',
            mediaUrl: encryptedFilePayload,
            fileName: selectedFile?.name || null,
            fileSize: selectedFile?.size || null,
            replyTo: replyingTo ? { id: replyingTo.id, author: replyingTo.author, text: replyingTo.message?.substring(0, 70) } : null,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isEncrypted: true,
            isDecrypted: true
          };

          processedMsgIdsRef.current.add(messageId);
          setMessages(prev => [...prev, localMsg]);

          if (socket.connected) {
            socket.emit('send_direct_message', {
              recipientId: activeDMUser.id || activeDMUser.username,
              messageId,
              ciphertext: enc
            });
          }
        }
      } catch (err) {
        console.error('Encryption error for direct message:', err);
      }

      playSendSound(soundEnabled);
      setInput('');
      setSelectedFile(null);
      setEncryptedFilePayload(null);
      setReplyingTo(null);

      if (socket.connected) {
        socket.emit('typing_stop', { username: authUser.username, roomId: currentRoomId });
      }
      return;
    }

    const targetUsers = new Map();
    for (const u of allUsers) {
      if (u.username !== authUser.username) {
        targetUsers.set(u.username, {
          userId: u.id,
          username: u.username
        });
      }
    }

    for (const [sId, userObj] of activeUsersMap.entries()) {
      if (userObj.username !== authUser.username) {
        targetUsers.set(userObj.username, {
          socketId: sId,
          userId: userObj.userId,
          username: userObj.username
        });
      }
    }

    for (const targetUser of targetUsers.values()) {
      try {
        let enc;
        const session = await cryptoKeys.store.loadSession(targetUser.username + '.1');
        if (!session) {
          const bundleData = await getKeyBundleRequest(targetUser.username, 1);
          if (bundleData && !bundleData.error) {
            enc = await encryptMessage(cryptoKeys.store, targetUser.username, textToSend, { preKeyBundle: bundleData });
          } else {
            console.warn(`Could not fetch PreKey bundle for ${targetUser.username}:`, bundleData?.error);
            continue;
          }
        } else {
          enc = await encryptMessage(cryptoKeys.store, targetUser.username, textToSend);
        }

        if (enc) {
          if (targetUser.username) payloads[targetUser.username] = enc;
          if (targetUser.socketId) payloads[targetUser.socketId] = enc;
          if (targetUser.userId) {
            payloads[targetUser.userId] = enc;
            payloads[String(targetUser.userId)] = enc;
          }
        }
      } catch (err) {
        console.error(`Encryption error for ${targetUser.username}:`, err);
      }
    }

    const messageData = {
      roomId: currentRoomId,
      senderId: authUser.id,
      author: authUser.username,
      payloads: payloads,
      mediaUrl: encryptedFilePayload,
      fileName: selectedFile?.name || null,
      fileSize: selectedFile?.size || null,
      replyTo: replyingTo ? { id: replyingTo.id, author: replyingTo.author, text: replyingTo.message?.substring(0, 70) } : null,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (socket.connected) {
      socket.emit('send_message', messageData);
    } else {
      const localMsg = {
        ...messageData,
        id: 'local_' + Date.now(),
        message: textToSend,
        isEncrypted: true,
        isDecrypted: true
      };
      setMessages(prev => [...prev, localMsg]);
    }

    playSendSound(soundEnabled);

    setInput('');
    setSelectedFile(null);
    setEncryptedFilePayload(null);
    setReplyingTo(null);

    if (socket.connected) {
      socket.emit('typing_stop', { username: authUser.username, roomId: currentRoomId });
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomData.name.trim()) return;

    try {
      const newRoom = await createRoom(newRoomData);
      if (newRoom) {
        setActiveRoom(newRoom.id);
        setActiveTab('channel');
        selectConversation(newRoom.id);
        setCreateRoomModal(false);
        setNewRoomData({ name: '', description: '' });
      }
    } catch {
      const localRoom = {
        id: newRoomData.name.toLowerCase().replace(/\s+/g, '-'),
        name: newRoomData.name,
        description: newRoomData.description,
        isPrivate: false,
        unreadCount: 0
      };
      setRooms(prev => [...prev, localRoom]);
      setActiveRoom(localRoom.id);
      setActiveTab('channel');
      selectConversation(localRoom.id);
      setCreateRoomModal(false);
      setNewRoomData({ name: '', description: '' });
    }
  };

  const handleDeleteMessage = (messageId) => {
    if (socket.connected) {
      socket.emit('delete_message', { messageId, roomId: currentRoomId });
    }
    deleteMessage(messageId);
  };

  const handleTogglePin = (msg) => {
    if (pinnedMessages.some(p => p.id === msg.id)) {
      setPinnedMessages(prev => prev.filter(p => p.id !== msg.id));
    } else {
      setPinnedMessages(prev => [...prev, msg]);
      setShowPinnedBanner(true);
    }
  };

  const handleCopyCiphertext = (msg) => {
    const payloads = msg.payloads || {};
    const cipher = payloads[socket.id] || payloads['all'] || payloads[authUser?.username] || payloads;
    if (cipher) {
      navigator.clipboard.writeText(JSON.stringify(cipher, null, 2));
      setCopiedMessageId(msg.id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }
  };

  const filteredMessages = messages.filter(msg => {
    if (!searchQuery) return true;
    return (msg.message || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (msg.author || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (!authUser) {
    return (
      <div className="min-h-screen bg-[#070913] flex items-center justify-center text-white">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <span>Opening HiChat Vault...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container font-sans bg-[#070913] text-gray-100 flex h-screen w-screen overflow-hidden select-none">
      
      {/* 1. Left Sidebar Navigation */}
      <aside className={`sidebar w-72 sm:w-80 bg-[#090d1a]/95 border-r border-white/10 flex flex-col shrink-0 backdrop-blur-2xl transition-all z-30 h-full ${
        isSidebarOpen ? 'fixed inset-y-0 left-0 shadow-2xl' : 'hidden md:flex'
      }`}>
        
        {/* Sidebar Header */}
        <div className="sidebar-header border-b border-white/10 px-5 py-4 flex items-center justify-between bg-black/20 shrink-0">
          <Link to="/" className="flex items-center gap-2.5 font-black text-lg bg-gradient-to-r from-purple-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-purple-600/30 group-hover:scale-105 transition-transform">
              <ShieldCheck size={18} />
            </div>
            <span>hichat <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-purple-950 border border-purple-500/30 text-purple-400">PRO</span></span>
          </Link>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
            >
              {soundEnabled ? <Volume2 size={16} className="text-purple-400" /> : <VolumeX size={16} className="text-gray-500" />}
            </button>
            {isSidebarOpen && (
              <button type="button" onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-gray-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* User Profile Bar with Status Badging */}
        <div className="relative px-4 py-3.5 bg-white/[0.02] border-b border-white/10 flex items-center gap-3 shrink-0">
          <div className="relative">
            <img
              src={authUser.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${authUser.username}`}
              alt="Avatar"
              className="w-10 h-10 rounded-full border-2 border-purple-500/50 object-cover bg-gray-900 shadow-md"
            />
            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#090d1a] ${
              userStatus === 'online' ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : userStatus === 'away' ? 'bg-amber-400' : 'bg-rose-500'
            }`} />
          </div>

          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setStatusDropdown(!statusDropdown)}>
            <div className="font-bold text-sm text-white flex items-center gap-1.5 truncate">
              <span className="truncate">{authUser.username}</span>
              <ChevronDown size={13} className="text-gray-400 shrink-0" />
            </div>
            <div className="text-[11px] text-purple-400 font-semibold flex items-center gap-1 mt-0.5">
              <span>● {userStatus.toUpperCase()}</span>
              {myFingerprint && (
                <span className="text-[10px] text-gray-500 font-mono truncate">
                  • {myFingerprint.substring(0, 10)}...
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            className="p-2 rounded-xl text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            onClick={handleLogout}
            title="Sign Out"
          >
            <LogOut size={16} />
          </button>

          {/* Status Dropdown Picker */}
          {statusDropdown && (
            <div className="absolute top-16 left-3 right-3 bg-gray-900 border border-purple-500/30 rounded-2xl p-2 z-50 shadow-2xl backdrop-blur-2xl">
              <div className="p-2.5 rounded-xl hover:bg-purple-600/20 cursor-pointer flex items-center gap-2.5 text-xs text-gray-200 transition" onClick={() => handleStatusChange('online')}>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="font-medium">Online (Active)</span>
              </div>
              <div className="p-2.5 rounded-xl hover:bg-purple-600/20 cursor-pointer flex items-center gap-2.5 text-xs text-gray-200 transition" onClick={() => handleStatusChange('away')}>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="font-medium">Away (AFK)</span>
              </div>
              <div className="p-2.5 rounded-xl hover:bg-purple-600/20 cursor-pointer flex items-center gap-2.5 text-xs text-gray-200 transition" onClick={() => handleStatusChange('dnd')}>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="font-medium">Do Not Disturb</span>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Nav List (Scrollable Channels & Direct Messages) */}
        <div className="p-3 flex-1 overflow-y-auto min-h-0 flex flex-col gap-4">
          
          {/* Channels Section */}
          <div>
            <div className="flex items-center justify-between px-2 pb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Encrypted Channels</span>
              <button
                type="button"
                className="p-1 rounded-lg text-purple-400 hover:text-white hover:bg-purple-600/20 transition cursor-pointer"
                onClick={() => setCreateRoomModal(true)}
                title="Create New Channel"
              >
                <Plus size={15} />
              </button>
            </div>

            <div className="space-y-1">
              {rooms.map(room => {
                const unread = unreadCounts[room.id] || 0;
                const isCurrent = activeTab === 'channel' && activeRoom === room.id;

                return (
                  <div
                    key={room.id}
                    onClick={() => {
                      setActiveTab('channel');
                      setActiveRoom(room.id);
                      setActiveDMUser(null);
                      selectConversation(room.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`px-3 py-2.5 rounded-xl cursor-pointer flex items-center gap-3 transition-all ${
                      isCurrent
                        ? 'bg-gradient-to-r from-purple-900/60 to-indigo-900/60 border border-purple-500/40 text-white font-bold shadow-md shadow-purple-950/40'
                        : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      isCurrent ? 'bg-purple-600 text-white' : 'bg-gray-800/80 text-gray-400'
                    }`}>
                      <Hash size={15} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{room.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{room.description}</div>
                    </div>

                    {unread > 0 && (
                      <span className="bg-purple-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow shrink-0">
                        {unread}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Direct Messages Section */}
          <div>
            <div className="flex items-center justify-between px-2 pb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Direct Messages</span>
              <span className="text-[10px] text-gray-500 font-mono">{allUsers.length} Users</span>
            </div>

            <div className="space-y-1">
              {allUsers.filter(u => u.username !== authUser.username).map(userObj => {
                const isCurrentDM = activeTab === 'dm' && activeDMUser?.username === userObj.username;
                const isOnline = Array.from(activeUsersMap.values()).some(u => u.username === userObj.username);

                return (
                  <div
                    key={userObj.id}
                    onClick={() => {
                      setActiveTab('dm');
                      setActiveDMUser(userObj);
                      selectConversation(null);
                      setIsSidebarOpen(false);
                      const dmRoom = [authUser?.username, userObj.username].sort().join('_dm_');
                      setUnreadCounts(prev => ({ ...prev, [dmRoom]: 0 }));
                      messages
                        .filter(m => m.author === userObj.username && m.status !== 'read')
                        .forEach(m => {
                          if (socket.connected) {
                            socket.emit('read_direct_message', { messageId: m.id, senderId: userObj.id });
                          }
                        });
                    }}
                    className={`px-3 py-2.5 rounded-xl cursor-pointer flex items-center gap-3 transition-all ${
                      isCurrentDM
                        ? 'bg-gradient-to-r from-purple-900/60 to-indigo-900/60 border border-purple-500/40 text-white font-bold shadow-md shadow-purple-950/40'
                        : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <img
                        src={`https://api.dicebear.com/7.x/bottts/svg?seed=${userObj.username}`}
                        alt="Avatar"
                        className="w-7 h-7 rounded-full border border-gray-800 bg-gray-900 object-cover"
                      />
                      <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border-2 border-[#090d1a] ${
                        isOnline ? 'bg-emerald-400' : 'bg-gray-600'
                      }`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold truncate block">{userObj.username}</span>
                      <p className="text-[10px] text-gray-500 truncate">
                        {isOnline ? 'Online • Ready to chat' : 'Offline'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Security & Key Verification Footer */}
        <div className="p-3 border-t border-white/10 bg-black/30 text-center shrink-0">
          <button
            type="button"
            onClick={() => setKeyModalUser({ username: authUser.username, fingerprint: myFingerprint })}
            className="w-full py-2 px-3 rounded-xl bg-purple-950/40 hover:bg-purple-900/40 border border-purple-500/30 text-purple-300 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Key size={13} />
            <span>ECDH Safety Fingerprint</span>
          </button>
        </div>

      </aside>

      {/* 2. Main Workspace Feed Area */}
      <main className="chat-main flex-1 flex flex-col h-full relative bg-[#070913] min-w-0 overflow-hidden">
        
        {/* Chat Top Header */}
        <header className="px-4 sm:px-6 py-3.5 border-b border-white/10 bg-[#090d1a]/85 backdrop-blur-xl flex items-center justify-between z-10 shadow-lg shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <Menu size={20} />
            </button>

            <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 font-bold shadow-md shadow-purple-950/50 shrink-0">
              {activeTab === 'channel' ? <Hash size={20} /> : <User size={20} />}
            </div>

            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-white flex items-center gap-2 truncate">
                <span>{activeTab === 'channel' ? `#${activeRoom}` : `@${activeDMUser?.username}`}</span>
                {activeTab === 'channel' && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                    E2EE LIVE
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-400 font-light truncate">
                {activeTab === 'channel'
                  ? rooms.find(r => r.id === activeRoom)?.description
                  : `Secure direct message channel with @${activeDMUser?.username}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Search Bar */}
            <div className="relative hidden sm:block">
              <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
              <input
                type="text"
                placeholder="Search messages..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-gray-950/80 border border-gray-800 focus:border-purple-500 text-xs text-white focus:outline-none transition w-36 lg:w-48 font-sans"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Pinned Messages Trigger */}
            {pinnedMessages.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPinnedBanner(!showPinnedBanner)}
                className="p-2 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-300 hover:text-white transition text-xs flex items-center gap-1.5 font-semibold cursor-pointer"
                title="View Pinned Messages"
              >
                <Pin size={14} />
                <span className="hidden sm:inline">{pinnedMessages.length} Pinned</span>
              </button>
            )}

            {/* Member Inspector Trigger */}
            <button
              type="button"
              className="p-2 rounded-xl bg-gray-900 border border-white/10 hover:border-purple-500/40 text-gray-300 transition shadow-sm cursor-pointer"
              onClick={() => setIsRightDrawerOpen(!isRightDrawerOpen)}
              title="Chat Info & Security"
            >
              <Users size={17} />
            </button>
          </div>
        </header>

        {/* Pinned Messages Header Dropdown */}
        {showPinnedBanner && pinnedMessages.length > 0 && (
          <div className="bg-purple-950/80 border-b border-purple-500/30 px-6 py-2.5 backdrop-blur-xl flex items-center justify-between text-xs text-purple-200 z-10 animate-fadeIn shrink-0">
            <div className="flex items-center gap-2 overflow-hidden">
              <Pin size={14} className="text-purple-400 shrink-0" />
              <span className="font-bold text-white">Pinned:</span>
              <span className="truncate italic">"{pinnedMessages[pinnedMessages.length - 1].message}"</span>
            </div>
            <button type="button" onClick={() => setShowPinnedBanner(false)} className="text-gray-400 hover:text-white cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Message Stream (Scrollable with min-h-0) */}
        <div className="chat-messages flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 flex flex-col gap-4">
          {filteredMessages.length === 0 ? (
            <div className="text-center my-auto p-8 rounded-3xl bg-gray-900/40 border border-white/5 backdrop-blur-md max-w-sm mx-auto shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 mx-auto mb-3 shadow-lg shadow-purple-600/20">
                <Sparkles size={28} className="animate-pulse" />
              </div>
              <h3 className="font-extrabold text-white text-lg mb-1">Encrypted Session Ready</h3>
              <p className="text-xs text-gray-400 font-light leading-relaxed">
                Messages in this channel are encrypted client-side using Web Crypto ECDH key derivation before reaching the network.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setInput('Hello team! 🚀 Encrypted chat is up and running.')}
                  className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg text-purple-300 transition cursor-pointer"
                >
                  "Hello team! 🚀"
                </button>
              </div>
            </div>
          ) : (
            filteredMessages.map((msg, index) => {
              const isSentByMe = msg.author === authUser.username;
              const isPinned = pinnedMessages.some(p => p.id === msg.id);

              return (
                <div
                  key={msg.id || index}
                  className={`flex gap-3 max-w-[85%] sm:max-w-[75%] group relative ${
                    isSentByMe ? 'self-end flex-row-reverse' : 'self-start'
                  }`}
                >
                  {/* User Avatar */}
                  <img
                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${msg.author}`}
                    alt="Avatar"
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-purple-500/30 shrink-0 bg-gray-900 mt-1 shadow-md"
                  />

                  {/* Message Bubble Card */}
                  <div className={`p-4 rounded-2xl border backdrop-blur-xl shadow-xl flex flex-col gap-2 relative transition-all ${
                    isSentByMe
                      ? 'bg-gradient-to-r from-purple-950/80 via-indigo-950/80 to-purple-900/70 border-purple-500/40 rounded-tr-sm text-white shadow-purple-950/30'
                      : 'bg-gray-900/90 border-white/10 rounded-tl-sm text-gray-100'
                  }`}>
                    
                    {/* Quoted / Reply Preview */}
                    {msg.replyTo && (
                      <div className="p-2 rounded-xl bg-black/40 border-l-2 border-purple-400 text-xs text-gray-300 mb-1 font-sans">
                        <span className="font-bold text-purple-300">@{msg.replyTo.author}: </span>
                        <span className="italic truncate">{msg.replyTo.text}</span>
                      </div>
                    )}

                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="font-bold text-purple-300 flex items-center gap-1">
                        <span>{msg.author}</span>
                        {isPinned && <Pin size={11} className="text-amber-400 fill-amber-400" />}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">{msg.time}</span>
                    </div>

                    {/* Body */}
                    <div className={`text-sm leading-relaxed ${msg.isDeleted ? 'italic text-gray-500' : 'text-gray-100'}`}>
                      {formatMessageContent(msg.message)}
                    </div>

                    {/* Voice Note Attachment Player */}
                    {msg.mediaUrl && msg.mediaUrl.startsWith('data:audio') && (
                      <AudioMessagePlayer audioUrl={msg.mediaUrl} />
                    )}

                    {/* Image Attachment with Lightbox */}
                    {msg.mediaUrl && msg.mediaUrl.startsWith('data:image') && !msg.isDeleted && (
                      <div
                        onClick={() => setLightboxImage(msg.mediaUrl)}
                        className="mt-2 rounded-xl overflow-hidden border border-white/10 cursor-pointer group/img relative"
                      >
                        <img src={msg.mediaUrl} alt="Attachment" className="max-w-[280px] max-h-[220px] object-cover block group-hover/img:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Maximize2 size={20} />
                        </div>
                      </div>
                    )}

                    {/* Document Attachment */}
                    {msg.mediaUrl && !msg.mediaUrl.startsWith('data:image') && !msg.mediaUrl.startsWith('data:audio') && (
                      <div className="mt-2 p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-xs gap-3">
                        <div className="flex items-center gap-2 truncate">
                          <FileText size={18} className="text-purple-400 shrink-0" />
                          <span className="truncate font-semibold">{msg.fileName || 'Encrypted Payload'}</span>
                        </div>
                        {msg.fileSize && (
                          <span className="text-[10px] text-gray-500 font-mono">{(msg.fileSize / 1024).toFixed(1)} KB</span>
                        )}
                      </div>
                    )}

                    {/* Reactions Chips */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1 pt-1">
                        {Object.entries(msg.reactions).map(([emoji, count]) => (
                          <button
                            type="button"
                            key={emoji}
                            onClick={() => handleAddReaction(msg.id, emoji)}
                            className="px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-purple-600/30 border border-white/10 text-xs flex items-center gap-1 transition cursor-pointer"
                          >
                            <span>{emoji}</span>
                            <span className="font-bold text-[10px] text-purple-300">{count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Message Control Bar */}
                    {!msg.isDeleted && (
                      <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-white/5 gap-2 text-xs">
                        {/* Quick Reaction Bar */}
                        <div className="flex items-center gap-1">
                          {['👍', '❤️', '🔥', '🚀'].map(emoji => (
                            <button
                              type="button"
                              key={emoji}
                              onClick={() => handleAddReaction(msg.id, emoji)}
                              className="w-6 h-6 rounded-lg hover:bg-white/10 flex items-center justify-center text-xs transition cursor-pointer"
                              title={`React ${emoji}`}
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setActiveReactionPickerId(activeReactionPickerId === msg.id ? null : msg.id)}
                            className="w-6 h-6 rounded-lg hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
                            title="More Reactions"
                          >
                            <Smile size={13} />
                          </button>
                        </div>

                        {/* Action Icons */}
                        <div className="flex items-center gap-1 text-gray-400">
                          {isSentByMe && (
                            msg.status === 'read' ? (
                              <CheckCheck size={14} className="text-cyan-400" title="Read" />
                            ) : msg.status === 'acknowledged' ? (
                              <CheckCheck size={14} className="text-purple-400" title="Acknowledged & Decrypted" />
                            ) : msg.status === 'delivered' ? (
                              <CheckCheck size={14} className="text-gray-400" title="Delivered" />
                            ) : (
                              <Check size={14} className="text-gray-500" title="Queued on Mailbox" />
                            )
                          )}
                          <button
                            type="button"
                            onClick={() => setReplyingTo(msg)}
                            className="p-1 hover:text-purple-300 transition cursor-pointer"
                            title="Reply to message"
                          >
                            <CornerDownRight size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTogglePin(msg)}
                            className={`p-1 transition cursor-pointer ${isPinned ? 'text-amber-400' : 'hover:text-white'}`}
                            title={isPinned ? 'Unpin message' : 'Pin message'}
                          >
                            <Pin size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyCiphertext(msg)}
                            className="p-1 hover:text-white transition cursor-pointer"
                            title="Copy Ciphertext"
                          >
                            {copiedMessageId === msg.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          </button>
                          {isSentByMe && (
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="p-1 hover:text-rose-400 transition cursor-pointer"
                              title="Delete message"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Popover Emoji Picker */}
                    {activeReactionPickerId === msg.id && (
                      <div className="absolute bottom-full left-0 mb-2 p-2 rounded-2xl bg-gray-900 border border-purple-500/30 shadow-2xl flex gap-1.5 z-40 animate-fadeIn">
                        {EMOJI_REACTIONS.map(emoji => (
                          <button
                            type="button"
                            key={emoji}
                            onClick={() => handleAddReaction(msg.id, emoji)}
                            className="w-8 h-8 rounded-xl hover:bg-white/10 flex items-center justify-center text-sm hover:scale-125 transition-transform cursor-pointer"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Live Typing Status Bar */}
        {typingStatus.size > 0 && (
          <div className="px-6 py-1.5 text-xs text-purple-300 italic flex items-center gap-2 bg-purple-950/30 border-t border-purple-500/20 font-mono shrink-0">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
            <span>{Array.from(typingStatus).join(', ')} {typingStatus.size === 1 ? 'is' : 'are'} typing...</span>
          </div>
        )}

        {/* Reply Quote Banner */}
        {replyingTo && (
          <div className="px-6 py-2 bg-purple-950/70 border-t border-purple-500/30 flex items-center justify-between text-xs text-purple-200 shrink-0">
            <div className="flex items-center gap-2 truncate">
              <CornerDownRight size={14} className="text-purple-400 shrink-0" />
              <span>Replying to <strong className="text-white">@{replyingTo.author}</strong>: <span className="italic">{replyingTo.message?.substring(0, 50)}...</span></span>
            </div>
            <button type="button" onClick={() => setReplyingTo(null)} className="text-gray-400 hover:text-white cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Attachment Preview Banner */}
        {selectedFile && (
          <div className="px-6 py-2.5 bg-purple-950/60 border-t border-purple-500/30 flex items-center justify-between text-xs text-purple-200 shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-purple-400" />
              <span>Attached: <strong className="text-white">{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
            </div>
            <button type="button" className="text-rose-400 font-bold hover:underline cursor-pointer" onClick={() => { setSelectedFile(null); setEncryptedFilePayload(null); }}>Remove</button>
          </div>
        )}

        {/* Input Bar with Voice Note & Media Upload */}
        <div className="p-3 sm:p-4 border-t border-white/10 bg-[#090d1a]/95 backdrop-blur-xl shrink-0">
          {isRecording ? (
            /* Voice Recording Dock */
            <div className="flex items-center justify-between gap-4 p-3 rounded-2xl bg-rose-950/40 border border-rose-500/40 animate-pulse">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                <span className="text-xs font-bold text-rose-300 font-mono">
                  Recording Voice Note: {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow cursor-pointer"
                >
                  Done & Send
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-3">
              {/* Attach File Button */}
              <label className="p-2.5 sm:p-3 rounded-xl bg-gray-900 border border-white/10 hover:border-purple-500/40 text-gray-400 hover:text-white cursor-pointer transition shrink-0 shadow-sm" title="Attach file or media">
                <Paperclip size={18} />
                <input type="file" className="hidden" onChange={handleFileSelection} />
              </label>

              {/* Record Audio Button */}
              <button
                type="button"
                onClick={startRecording}
                className="p-2.5 sm:p-3 rounded-xl bg-gray-900 border border-white/10 hover:border-purple-500/40 text-gray-400 hover:text-white transition shrink-0 shadow-sm cursor-pointer"
                title="Record Voice Note"
              >
                <Mic size={18} />
              </button>

              {/* Text Input */}
              <input
                type="text"
                placeholder={activeTab === 'channel' ? `Message #${activeRoom} (type /help for commands)...` : `Message @${activeDMUser?.username}...`}
                className="flex-1 px-4 py-3 rounded-xl bg-gray-950/80 border border-gray-800 focus:border-purple-500 text-sm text-white focus:outline-none transition placeholder-gray-500 font-sans shadow-inner"
                value={input}
                onChange={handleInputChange}
              />

              {/* Send Button */}
              <button
                type="submit"
                className="px-5 sm:px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-sm shadow-xl shadow-purple-600/30 transition flex items-center gap-2 shrink-0 group cursor-pointer"
              >
                <Send size={16} className="group-hover:translate-x-0.5 transition-transform" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          )}
        </div>

      </main>

      {/* 3. Right Security & Chat Info Drawer */}
      {isRightDrawerOpen && (
        <aside className="w-80 bg-[#090d1a]/95 border-l border-white/10 p-5 flex flex-col gap-5 backdrop-blur-2xl shrink-0 overflow-y-auto min-h-0 h-full animate-fadeIn z-30">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <ShieldCheck size={17} className="text-purple-400" />
              <span>Security & Info</span>
            </h3>
            <button type="button" className="text-gray-400 hover:text-white font-bold text-sm cursor-pointer" onClick={() => setIsRightDrawerOpen(false)}>✕</button>
          </div>

          {/* Channel Overview Card */}
          <div className="p-4 rounded-2xl bg-gray-900/80 border border-purple-500/30 space-y-2 shrink-0">
            <div className="font-bold text-sm text-purple-300">
              {activeTab === 'channel' ? `#${activeRoom}` : `@${activeDMUser?.username}`}
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Protected by Web Crypto API with 256-bit AES-GCM encryption derived via ECDH Curve P-256.
            </p>
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-emerald-400">
              <span>● Status: Secure & Verified</span>
              <Lock size={12} />
            </div>
          </div>

          {/* Active Members in Room */}
          <div className="shrink-0">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center justify-between">
              <span>Channel Members</span>
              <span className="text-[10px] text-purple-400 font-mono">{activeUsersMap.size} Active</span>
            </div>

            <div className="space-y-2">
              {Array.from(activeUsersMap.values()).map(u => (
                <div
                  key={u.socketId}
                  className="p-3 rounded-xl bg-gray-900/60 border border-white/10 hover:border-purple-500/40 cursor-pointer flex items-center justify-between transition group"
                  onClick={async () => {
                    const print = await getPublicKeyFingerprint(u.rawPublicKey);
                    setKeyModalUser({ username: u.username, fingerprint: print });
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src={`https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`}
                      alt="Avatar"
                      className="w-7 h-7 rounded-full border border-purple-500/30"
                    />
                    <div className="text-xs text-white font-medium group-hover:text-purple-300 transition">
                      {u.username}
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono ${u.status === 'online' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    ● {u.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Security Tools */}
          <div className="pt-3 border-t border-white/10 space-y-2 shrink-0">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Vault Utilities</div>
            <button
              type="button"
              onClick={() => setKeyModalUser({ username: authUser.username, fingerprint: myFingerprint })}
              className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-300 hover:text-white flex items-center gap-2 transition text-left cursor-pointer"
            >
              <Key size={14} className="text-purple-400" />
              <span>Verify Cryptographic Fingerprint</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCommandsHelp(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-300 hover:text-white flex items-center gap-2 transition text-left cursor-pointer"
            >
              <Code size={14} className="text-cyan-400" />
              <span>Quick Slash Commands Guide</span>
            </button>
          </div>
        </aside>
      )}

      {/* 4. Create Group Modal */}
      {createRoomModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-purple-500/30 p-6 rounded-3xl w-full max-w-md shadow-2xl animate-fadeIn">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Plus size={20} className="text-purple-400" />
              <span>Create Encrypted Channel</span>
            </h2>
            <p className="text-xs text-gray-400 mb-5">Channels provide real-time zero-knowledge message broadcast.</p>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Channel Name</label>
                <input
                  type="text"
                  placeholder="e.g. quantum-research"
                  className="w-full px-4 py-3 rounded-xl bg-gray-950 border border-gray-800 focus:border-purple-500 text-white text-sm focus:outline-none"
                  value={newRoomData.name}
                  onChange={e => setNewRoomData({ ...newRoomData, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Description</label>
                <input
                  type="text"
                  placeholder="Topic and team focus"
                  className="w-full px-4 py-3 rounded-xl bg-gray-950 border border-gray-800 focus:border-purple-500 text-white text-sm focus:outline-none"
                  value={newRoomData.description}
                  onChange={e => setNewRoomData({ ...newRoomData, description: e.target.value })}
                />
              </div>

              <div className="flex gap-3 justify-end pt-3">
                <button type="button" className="px-5 py-2.5 rounded-xl bg-gray-800 text-gray-300 font-semibold text-xs hover:bg-gray-700 transition cursor-pointer" onClick={() => setCreateRoomModal(false)}>Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs hover:from-purple-500 hover:to-indigo-500 transition shadow-lg shadow-purple-600/30 cursor-pointer">Create Channel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Cryptographic Security Fingerprint Modal */}
      {keyModalUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-purple-500/40 p-7 rounded-3xl w-full max-w-md shadow-2xl text-center animate-fadeIn">
            <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 mx-auto mb-4 shadow-lg shadow-purple-600/20">
              <ShieldCheck size={32} />
            </div>

            <h2 className="text-xl font-bold text-white mb-1">Cryptographic Fingerprint</h2>
            <p className="text-xs text-gray-400 mb-5">
              Public Key verification for <strong className="text-purple-300">@{keyModalUser.username}</strong>
            </p>

            <div className="bg-gray-950 p-4 rounded-2xl border border-purple-900/60 font-mono text-xs text-purple-300 break-all my-4 shadow-inner">
              {keyModalUser.fingerprint}
            </div>

            <div className="text-[11px] text-gray-400 text-left bg-white/5 p-3 rounded-xl mb-5 space-y-1">
              <div>• Algorithm: <strong>ECDH P-256 (NIST Curve)</strong></div>
              <div>• Cipher: <strong>AES-GCM-256 Authenticated Encryption</strong></div>
              <div>• Key Exchange: <strong>Zero-Trust Client Derived</strong></div>
            </div>

            <button
              type="button"
              className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
              onClick={() => setKeyModalUser(null)}
            >
              <CheckCheck size={16} /> Verified & Authentic
            </button>
          </div>
        </div>
      )}

      {/* 6. Slash Commands Guide Modal */}
      {showCommandsHelp && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-purple-500/40 p-6 rounded-3xl w-full max-w-md shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Code size={18} className="text-cyan-400" />
                <span>Slash Commands</span>
              </h3>
              <button type="button" onClick={() => setShowCommandsHelp(false)} className="text-gray-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-gray-300 font-mono">
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
                <span className="text-purple-300">/help</span>
                <span className="text-gray-400 font-sans">Show commands modal</span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
                <span className="text-purple-300">/clear</span>
                <span className="text-gray-400 font-sans">Clear local message feed</span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
                <span className="text-purple-300">/shrug</span>
                <span className="text-gray-400 font-sans">Append ¯\_(ツ)_/¯</span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
                <span className="text-purple-300">/flip</span>
                <span className="text-gray-400 font-sans">Append (╯°□°)╯︵ ┻━┻</span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
                <span className="text-purple-300">/status &lt;online|away|dnd&gt;</span>
                <span className="text-gray-400 font-sans">Update status</span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
                <span className="text-purple-300">/keys</span>
                <span className="text-gray-400 font-sans">View E2EE keys</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCommandsHelp(false)}
              className="mt-5 w-full py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* 7. Image Lightbox Modal */}
      {lightboxImage && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-lg z-50 flex items-center justify-center p-4" onClick={() => setLightboxImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/20">
            <img src={lightboxImage} alt="Fullscreen View" className="w-full h-full object-contain" />
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/70 text-white hover:bg-black cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
