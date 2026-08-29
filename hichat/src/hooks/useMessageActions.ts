import { useState, useRef, useCallback } from 'react';
import { Message, ActiveUser, UserStatusType } from '../types/chat';
import { User } from '../types/user';
import { useChatStore } from '../store/chat.store';
import { useUIStore } from '../store/ui.store';
import { useEncryption } from './useEncryption';
import { playSendSound, playReactionSound, playRecordStartSound } from '../soundUtils';
import { socket } from '../api/socket';

interface UseMessageActionsProps {
  authUser: User | null;
  cryptoKeys: any;
  myFingerprint: string;
  currentRoomId: string;
  activeTab: 'channel' | 'dm';
  activeDMUser: User | null;
  allUsers: User[];
  activeUsersMap: Map<string, ActiveUser>;
  processedMsgIdsRef: React.MutableRefObject<Set<string>>;
  stopTyping: () => void;
  handleStatusChange: (status: UserStatusType) => void;
}

export function useMessageActions({
  authUser,
  cryptoKeys,
  myFingerprint,
  currentRoomId,
  activeTab,
  activeDMUser,
  allUsers,
  activeUsersMap,
  processedMsgIdsRef,
  stopTyping,
  handleStatusChange,
}: UseMessageActionsProps) {
  const setMessages = useChatStore((state) => state.setMessages);
  const deleteMessage = useChatStore((state) => state.deleteMessage);
  const clearMessages = useChatStore((state) => state.clearMessages);
  const soundEnabled = useUIStore((state) => state.soundEnabled);
  const { encryptMessage, encryptForUsers } = useEncryption(cryptoKeys?.store);

  const [input, setInput] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [encryptedFilePayload, setEncryptedFilePayload] = useState<string | null>(null);

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [showPinnedBanner, setShowPinnedBanner] = useState<boolean>(false);

  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);
  const [showCommandsHelp, setShowCommandsHelp] = useState<boolean>(false);
  const [keyModalUser, setKeyModalUser] = useState<{ username: string; fingerprint: string } | null>(null);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          setEncryptedFilePayload(reader.result as string);
          setSelectedFile({
            name: `voice_note_${Date.now()}.webm`,
            size: audioBlob.size,
            isAudio: true,
          });
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingDuration(0);
      playRecordStartSound(soundEnabled);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      alert('Microphone access is required to record voice notes.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      setSelectedFile(null);
      setEncryptedFilePayload(null);
    }
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setEncryptedFilePayload(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAddReaction = useCallback(
    (messageId: string, emoji: string) => {
      setActiveReactionPickerId(null);

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === messageId) {
            const reactions = { ...(msg.reactions || {}) };
            reactions[emoji] = (reactions[emoji] || 0) + 1;
            return { ...msg, reactions };
          }
          return msg;
        })
      );

      playReactionSound(soundEnabled);

      if (socket.connected && authUser?.username) {
        socket.emit('add_reaction', {
          messageId,
          emoji,
          username: authUser.username,
          roomId: currentRoomId,
        });
      }
    },
    [authUser?.username, currentRoomId, setMessages, soundEnabled]
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (socket.connected) {
        socket.emit('delete_message', { messageId, roomId: currentRoomId });
      }
      deleteMessage(messageId);
    },
    [currentRoomId, deleteMessage]
  );

  const handleTogglePin = useCallback(
    (msg: Message) => {
      if (pinnedMessages.some((p) => p.id === msg.id)) {
        setPinnedMessages((prev) => prev.filter((p) => p.id !== msg.id));
      } else {
        setPinnedMessages((prev) => [...prev, msg]);
        setShowPinnedBanner(true);
      }
    },
    [pinnedMessages]
  );

  const handleCopyCiphertext = useCallback(
    (msg: Message) => {
      const payloads = msg.payloads || {};
      const cipher =
        payloads[socket.id || ''] ||
        payloads['all'] ||
        payloads[authUser?.username || ''] ||
        payloads;
      if (cipher) {
        navigator.clipboard.writeText(JSON.stringify(cipher, null, 2));
        setCopiedMessageId(msg.id);
        setTimeout(() => setCopiedMessageId(null), 2000);
      }
    },
    [authUser?.username]
  );

  const processSlashCommand = (cmdText: string): boolean => {
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
      if (authUser?.username) {
        setKeyModalUser({ username: authUser.username, fingerprint: myFingerprint });
      }
      return true;
    }
    if (command === '/status') {
      const statusArg = parts[1]?.toLowerCase();
      if (['online', 'away', 'dnd'].includes(statusArg)) {
        handleStatusChange(statusArg as UserStatusType);
        return true;
      }
    }
    return false;
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
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

    if (activeTab === 'dm' && activeDMUser) {
      const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

      try {
        const enc = await encryptMessage(activeDMUser.username, textToSend);

        if (enc) {
          const localMsg: Message = {
            id: messageId,
            roomId: currentRoomId,
            senderId: authUser.id,
            author: authUser.username,
            message: textToSend,
            status: 'queued',
            mediaUrl: encryptedFilePayload,
            fileName: selectedFile?.name || null,
            fileSize: selectedFile?.size || null,
            replyTo: replyingTo
              ? {
                  id: replyingTo.id,
                  author: replyingTo.author,
                  text: replyingTo.message?.substring(0, 70),
                }
              : null,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isEncrypted: true,
            isDecrypted: true,
          };

          processedMsgIdsRef.current.add(messageId);
          setMessages((prev) => [...prev, localMsg]);

          if (socket.connected) {
            socket.emit('send_direct_message', {
              recipientId: activeDMUser.id || activeDMUser.username,
              messageId,
              ciphertext: enc,
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
      stopTyping();
      return;
    }

    // Channel / Multi-Recipient Message
    const targetUsers = new Map<string, { socketId?: string; userId?: string; username: string }>();
    for (const u of allUsers) {
      if (u.username !== authUser.username) {
        targetUsers.set(u.username, {
          userId: u.id,
          username: u.username,
        });
      }
    }

    for (const [sId, userObj] of activeUsersMap.entries()) {
      if (userObj.username !== authUser.username) {
        targetUsers.set(userObj.username, {
          socketId: sId,
          userId: userObj.userId,
          username: userObj.username,
        });
      }
    }

    const payloads = await encryptForUsers(Array.from(targetUsers.values()), textToSend);

    const messageData: any = {
      roomId: currentRoomId,
      senderId: authUser.id,
      author: authUser.username,
      payloads: payloads,
      mediaUrl: encryptedFilePayload,
      fileName: selectedFile?.name || null,
      fileSize: selectedFile?.size || null,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            author: replyingTo.author,
            text: replyingTo.message?.substring(0, 70),
          }
        : null,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    if (socket.connected) {
      socket.emit('send_message', messageData);
    } else {
      const localMsg: Message = {
        ...messageData,
        id: 'local_' + Date.now(),
        message: textToSend,
        isEncrypted: true,
        isDecrypted: true,
      };
      setMessages((prev) => [...prev, localMsg]);
    }

    playSendSound(soundEnabled);

    setInput('');
    setSelectedFile(null);
    setEncryptedFilePayload(null);
    setReplyingTo(null);
    stopTyping();
  };

  return {
    input,
    setInput,
    selectedFile,
    setSelectedFile,
    encryptedFilePayload,
    setEncryptedFilePayload,
    handleFileSelection,
    replyingTo,
    setReplyingTo,
    pinnedMessages,
    showPinnedBanner,
    setShowPinnedBanner,
    copiedMessageId,
    activeReactionPickerId,
    setActiveReactionPickerId,
    showCommandsHelp,
    setShowCommandsHelp,
    keyModalUser,
    setKeyModalUser,
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
    handleAddReaction,
    handleDeleteMessage,
    handleTogglePin,
    handleCopyCiphertext,
    processSlashCommand,
    handleSendMessage,
  };
}
