import { useState, useCallback } from 'react';
import { User } from '../types/user';
import { ActiveUser, UserStatusType } from '../types/chat';
import { useChats } from './useChats';
import { useUI } from './useUI';
import { socket } from '../api/socket';

export function useConversation(authUser: User | null) {
  const {
    conversations: rooms,
    allUsers,
    messages,
    setConversations: setRooms,
    selectConversation,
    createRoom,
  } = useChats();

  const { setIsSidebarOpen, openModal, closeModal, activeModal } = useUI();

  const [activeTab, setActiveTab] = useState<'channel' | 'dm'>('channel');
  const [activeRoom, setActiveRoom] = useState<string>('general');
  const [activeDMUser, setActiveDMUser] = useState<User | null>(null);
  const [activeUsersMap, setActiveUsersMap] = useState<Map<string, ActiveUser>>(new Map());
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [userStatus, setUserStatus] = useState<UserStatusType>('online');
  const [statusDropdown, setStatusDropdown] = useState<boolean>(false);
  const [newRoomData, setNewRoomData] = useState<{ name: string; description: string }>({
    name: '',
    description: '',
  });

  const createRoomModal = activeModal === 'createRoom';
  const setCreateRoomModal = useCallback(
    (val: boolean) => (val ? openModal('createRoom') : closeModal()),
    [openModal, closeModal]
  );

  const currentRoomId =
    activeTab === 'channel'
      ? activeRoom
      : activeDMUser
      ? [authUser?.username, activeDMUser?.username].sort().join('_dm_')
      : activeRoom;

  const handleStatusChange = useCallback((status: UserStatusType) => {
    setUserStatus(status);
    setStatusDropdown(false);
    if (socket.connected) {
      socket.emit('update_status', status);
    }
  }, []);

  const selectChannel = useCallback(
    (roomId: string) => {
      setActiveTab('channel');
      setActiveRoom(roomId);
      setActiveDMUser(null);
      selectConversation(roomId);
      setIsSidebarOpen(false);
    },
    [selectConversation, setIsSidebarOpen]
  );

  const selectDM = useCallback(
    (userObj: User) => {
      setActiveTab('dm');
      setActiveDMUser(userObj);
      selectConversation(null);
      setIsSidebarOpen(false);
      const dmRoom = [authUser?.username, userObj.username].sort().join('_dm_');
      setUnreadCounts((prev) => ({ ...prev, [dmRoom]: 0 }));
      messages
        .filter((m) => m.author === userObj.username && m.status !== 'read')
        .forEach((m) => {
          if (socket.connected) {
            socket.emit('read_direct_message', { messageId: m.id, senderId: userObj.id });
          }
        });
    },
    [authUser?.username, messages, selectConversation, setIsSidebarOpen]
  );

  const handleCreateRoom = useCallback(
    async (e: React.FormEvent) => {
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
          unreadCount: 0,
        };
        setRooms((prev) => [...prev, localRoom]);
        setActiveRoom(localRoom.id);
        setActiveTab('channel');
        selectConversation(localRoom.id);
        setCreateRoomModal(false);
        setNewRoomData({ name: '', description: '' });
      }
    },
    [createRoom, newRoomData, selectConversation, setCreateRoomModal, setRooms]
  );

  return {
    rooms,
    allUsers,
    activeTab,
    setActiveTab,
    activeRoom,
    setActiveRoom,
    activeDMUser,
    setActiveDMUser,
    currentRoomId,
    activeUsersMap,
    setActiveUsersMap,
    unreadCounts,
    setUnreadCounts,
    userStatus,
    setUserStatus,
    statusDropdown,
    setStatusDropdown,
    handleStatusChange,
    selectChannel,
    selectDM,
    newRoomData,
    setNewRoomData,
    createRoomModal,
    setCreateRoomModal,
    handleCreateRoom,
  };
}
