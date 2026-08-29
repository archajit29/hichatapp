import React, { useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useUI } from '../hooks/useUI';
import { useConversation } from '../hooks/useConversation';
import { useChatMessages } from '../hooks/useChatMessages';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { useMessageActions } from '../hooks/useMessageActions';
import { useSignalKeys } from '../hooks/useSignalKeys';
import { ChatLayout } from '../components/chat/ChatLayout';
import { socket } from '../api/socket';
import '../App.css';

export default function Chat() {
  const navigate = useNavigate();

  // 1. Auth & UI State
  const {
    user: authUser,
    cryptoKeys,
    fingerprint: myFingerprint,
    setUser,
  } = useAuth();

  const {
    loadOrGenerateKeys,
    ensureKeysUploaded,
    getFingerprint,
  } = useSignalKeys();

  const {
    sidebarOpen: isSidebarOpen,
    setIsSidebarOpen,
    rightDrawerOpen: isRightDrawerOpen,
    setIsRightDrawerOpen,
    soundEnabled,
    setSoundEnabled,
  } = useUI();

  // 2. Conversation & Channel Hook
  const {
    rooms,
    allUsers,
    activeTab,
    activeRoom,
    activeDMUser,
    currentRoomId,
    activeUsersMap,
    setActiveUsersMap,
    unreadCounts,
    setUnreadCounts,
    userStatus,
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
  } = useConversation(authUser);

  // 3. Message Stream & Decryption Hook
  const {
    filteredMessages,
    searchQuery,
    setSearchQuery,
    lightboxImage,
    setLightboxImage,
    messagesEndRef,
    processedMsgIdsRef,
  } = useChatMessages({
    authUser,
    cryptoKeys,
    currentRoomId,
    activeTab,
    activeDMUser,
    activeUsersMap,
    setActiveUsersMap,
    setUnreadCounts,
  });

  // 4. Typing Indicator Hook
  const { typingStatus, handleTypingActivity, stopTyping } = useTypingIndicator({
    authUser,
    currentRoomId,
  });

  // 5. Message Actions & Sending Hook
  const {
    input,
    setInput,
    selectedFile,
    setSelectedFile,
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
    handleSendMessage,
  } = useMessageActions({
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
  });

  // 6. Initialize Signal Protocol Vault via useSignalKeys hook
  const initCryptoForUser = useCallback(
    async (userObj, token) => {
      try {
        const username = typeof userObj === 'string' ? userObj : userObj.username;
        const userId = typeof userObj === 'object' ? userObj.id : authUser?.id;
        const keys = await loadOrGenerateKeys(username);

        if (token) {
          await ensureKeysUploaded(username, keys.store, 1);
          socket.auth = { token };
        }

        socket.connect();
        socket.emit('join', {
          userId: userId,
          username: username,
          publicKey: keys.publicKeyJwk,
          room: activeRoom,
          status: userStatus,
        });
      } catch (_err) {
        console.error('Failed initializing crypto:', _err);
      }
    },
    [activeRoom, authUser, loadOrGenerateKeys, ensureKeysUploaded, userStatus]
  );

  // 7. Restore User Session
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

  // 8. Sign Out
  const handleLogout = useCallback(() => {
    localStorage.removeItem('hichat_jwt_token');
    localStorage.removeItem('hichat_refresh_token');
    localStorage.removeItem('hichat_user');
    socket.disconnect();
    navigate('/login');
  }, [navigate]);

  // 9. Input change handler bridging typing activity
  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
    handleTypingActivity();
  }, [setInput, handleTypingActivity]);

  // 10. Quick sample message
  const handleQuickMessage = useCallback((text) => {
    setInput(text);
  }, [setInput]);

  const handleVerifyUser = useCallback(async (u) => {
    const print = await getFingerprint(u.rawPublicKey);
    setKeyModalUser({ username: u.username, fingerprint: print });
  }, [getFingerprint, setKeyModalUser]);

  // Stable event handlers for subcomponents
  const handleCloseSidebar = useCallback(() => setIsSidebarOpen(false), [setIsSidebarOpen]);
  const handleOpenSidebar = useCallback(() => setIsSidebarOpen(true), [setIsSidebarOpen]);
  const handleToggleSound = useCallback(() => setSoundEnabled(!soundEnabled), [setSoundEnabled, soundEnabled]);
  const handleToggleStatusDropdown = useCallback(() => setStatusDropdown((prev) => !prev), [setStatusDropdown]);
  const handleTogglePinnedBanner = useCallback(() => setShowPinnedBanner((prev) => !prev), [setShowPinnedBanner]);
  const handleClosePinnedBanner = useCallback(() => setShowPinnedBanner(false), [setShowPinnedBanner]);
  const handleToggleRightDrawer = useCallback(() => setIsRightDrawerOpen((prev) => !prev), [setIsRightDrawerOpen]);
  const handleCloseRightDrawer = useCallback(() => setIsRightDrawerOpen(false), [setIsRightDrawerOpen]);
  const handleToggleReactionPicker = useCallback((id) => {
    setActiveReactionPickerId((prev) => (prev === id ? null : id));
  }, [setActiveReactionPickerId]);
  const handleCloseLightbox = useCallback(() => setLightboxImage(null), [setLightboxImage]);
  const handleCancelReply = useCallback(() => setReplyingTo(null), [setReplyingTo]);
  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setEncryptedFilePayload(null);
  }, [setSelectedFile, setEncryptedFilePayload]);
  const handleCloseCreateRoomModal = useCallback(() => setCreateRoomModal(false), [setCreateRoomModal]);
  const handleOpenCreateRoomModal = useCallback(() => setCreateRoomModal(true), [setCreateRoomModal]);
  const handleCloseKeyModal = useCallback(() => setKeyModalUser(null), [setKeyModalUser]);
  const handleOpenKeyModal = useCallback(() => {
    if (authUser?.username) {
      setKeyModalUser({ username: authUser.username, fingerprint: myFingerprint });
    }
  }, [authUser, myFingerprint, setKeyModalUser]);
  const handleCloseCommandsHelp = useCallback(() => setShowCommandsHelp(false), [setShowCommandsHelp]);
  const handleOpenCommandsHelp = useCallback(() => setShowCommandsHelp(true), [setShowCommandsHelp]);

  const activeRoomObj = useMemo(() => rooms.find((r) => r.id === activeRoom), [rooms, activeRoom]);

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
    <ChatLayout
      authUser={authUser}
      myFingerprint={myFingerprint}
      isSidebarOpen={isSidebarOpen}
      onCloseSidebar={handleCloseSidebar}
      onOpenSidebar={handleOpenSidebar}
      soundEnabled={soundEnabled}
      onToggleSound={handleToggleSound}
      onLogout={handleLogout}
      userStatus={userStatus}
      statusDropdown={statusDropdown}
      onToggleStatusDropdown={handleToggleStatusDropdown}
      onStatusChange={handleStatusChange}
      rooms={rooms}
      activeTab={activeTab}
      activeRoom={activeRoom}
      activeDMUser={activeDMUser}
      activeRoomDescription={activeRoomObj?.description}
      unreadCounts={unreadCounts}
      onSelectChannel={selectChannel}
      onSelectDM={selectDM}
      allUsers={allUsers}
      activeUsersMap={activeUsersMap}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      pinnedMessages={pinnedMessages}
      showPinnedBanner={showPinnedBanner}
      onTogglePinnedBanner={handleTogglePinnedBanner}
      onClosePinnedBanner={handleClosePinnedBanner}
      isRightDrawerOpen={isRightDrawerOpen}
      onToggleRightDrawer={handleToggleRightDrawer}
      onCloseRightDrawer={handleCloseRightDrawer}
      filteredMessages={filteredMessages}
      copiedMessageId={copiedMessageId}
      activeReactionPickerId={activeReactionPickerId}
      messagesEndRef={messagesEndRef}
      onReply={setReplyingTo}
      onTogglePin={handleTogglePin}
      onCopyCiphertext={handleCopyCiphertext}
      onDelete={handleDeleteMessage}
      onAddReaction={handleAddReaction}
      onToggleReactionPicker={handleToggleReactionPicker}
      onOpenLightbox={setLightboxImage}
      onCloseLightbox={handleCloseLightbox}
      lightboxImage={lightboxImage}
      onQuickMessage={handleQuickMessage}
      typingStatus={typingStatus}
      input={input}
      onInputChange={handleInputChange}
      onSubmitMessage={handleSendMessage}
      replyingTo={replyingTo}
      onCancelReply={handleCancelReply}
      selectedFile={selectedFile}
      onRemoveFile={handleRemoveFile}
      onFileSelect={handleFileSelection}
      isRecording={isRecording}
      recordingDuration={recordingDuration}
      onStartRecording={startRecording}
      onStopRecording={stopRecording}
      onCancelRecording={cancelRecording}
      createRoomModal={createRoomModal}
      onCloseCreateRoomModal={handleCloseCreateRoomModal}
      onOpenCreateRoomModal={handleOpenCreateRoomModal}
      newRoomData={newRoomData}
      onNewRoomDataChange={setNewRoomData}
      onCreateRoomSubmit={handleCreateRoom}
      keyModalUser={keyModalUser}
      onCloseKeyModal={handleCloseKeyModal}
      onOpenKeyModal={handleOpenKeyModal}
      onVerifyUser={handleVerifyUser}
      showCommandsHelp={showCommandsHelp}
      onCloseCommandsHelp={handleCloseCommandsHelp}
      onOpenCommandsHelp={handleOpenCommandsHelp}
    />
  );
}
