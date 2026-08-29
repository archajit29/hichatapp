import { useState, useEffect, useRef, useCallback } from 'react';
import { User } from '../types/user';
import { socket } from '../api/socket';

interface UseTypingIndicatorProps {
  authUser: User | null;
  currentRoomId: string;
}

export function useTypingIndicator({ authUser, currentRoomId }: UseTypingIndicatorProps) {
  const [typingStatus, setTypingStatus] = useState<Set<string>>(new Set());
  const isTypingRef = useRef<boolean>(false);
  const lastTypingTimeRef = useRef<number>(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleUserTyping = (data: { roomId: string; username: string; isTyping: boolean }) => {
      if (data.roomId === currentRoomId) {
        setTypingStatus((prev) => {
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

    socket.on('user_typing', handleUserTyping);

    return () => {
      socket.off('user_typing', handleUserTyping);
    };
  }, [currentRoomId, authUser?.username]);

  // Debounced/throttled typing start and stop activity handler
  const handleTypingActivity = useCallback(() => {
    if (socket.connected && authUser?.username) {
      const now = Date.now();
      // Only emit typing_start if not already marked typing or > 1500ms since last emission
      if (!isTypingRef.current || now - lastTypingTimeRef.current > 1500) {
        isTypingRef.current = true;
        lastTypingTimeRef.current = now;
        socket.emit('typing_start', { username: authUser.username, roomId: currentRoomId });
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
        if (socket.connected && authUser?.username) {
          socket.emit('typing_stop', { username: authUser.username, roomId: currentRoomId });
        }
      }, 2000);
    }
  }, [authUser?.username, currentRoomId]);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current && socket.connected && authUser?.username) {
      isTypingRef.current = false;
      socket.emit('typing_stop', { username: authUser.username, roomId: currentRoomId });
    }
  }, [authUser?.username, currentRoomId]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  return {
    typingStatus,
    handleTypingActivity,
    stopTyping,
  };
}
