import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useUI } from '../hooks/useUI';
import { useConversation } from '../hooks/useConversation';
import { useChatMessages } from '../hooks/useChatMessages';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { useMessageActions } from '../hooks/useMessageActions';
import { ChatLayout } from '../components/chat/ChatLayout';
import {
  loadOrGenerateUserKeys,
  getPublicKeyFingerprint,
  generateSignalPreKeyBundle,
} from '../cryptoUtils';
import { getKeyCountRequest, uploadKeysRequest } from '../api/keys';
import { socket } from '../api/socket';
import '../App.css';

export default function Chat() {
  const navigate = useNavigate();

  // 1. Auth & UI State
  const {
    user: authUser,
    cryptoKeys,
    setCryptoKeys,
    fingerprint: myFingerprint,
    setFingerprint: setMyFingerprint,
    setUser,
  } = useAuth();

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

  // 6. Initialize Signal Protocol Vault
  const initCryptoForUser = useCallback(
    async (userObj, token) => {
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
          status: userStatus,
        });
      } catch (_err) {
        console.error('Failed initializing crypto:', _err);
      }
    },
    [activeRoom, authUser, setCryptoKeys, setMyFingerprint, userStatus]
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
  const handleLogout = () => {
    localStorage.removeItem('hichat_jwt_token');
    localStorage.removeItem('hichat_refresh_token');
    localStorage.removeItem('hichat_user');
    socket.disconnect();
    navigate('/login');
  };

  // 9. Input change handler bridging typing activity
  const handleInputChange = (e) => {
    setInput(e.target.value);
    handleTypingActivity();
  };

  // 10. Quick sample message
  const handleQuickMessage = (text) => {
    setInput(text);
  };

  const handleVerifyUser = async (u) => {
    const print = await getPublicKeyFingerprint(u.rawPublicKey);
    setKeyModalUser({ username: u.username, fingerprint: print });
  };

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

  const activeRoomObj = rooms.find((r) => r.id === activeRoom);

  return (
    <ChatLayout
      authUser={authUser}
      myFingerprint={myFingerprint}
      isSidebarOpen={isSidebarOpen}
      onCloseSidebar={() => setIsSidebarOpen(false)}
      onOpenSidebar={() => setIsSidebarOpen(true)}
      soundEnabled={soundEnabled}
      onToggleSound={() => setSoundEnabled(!soundEnabled)}
      onLogout={handleLogout}
      userStatus={userStatus}
      statusDropdown={statusDropdown}
      onToggleStatusDropdown={() => setStatusDropdown(!statusDropdown)}
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
      onTogglePinnedBanner={() => setShowPinnedBanner(!showPinnedBanner)}
      onClosePinnedBanner={() => setShowPinnedBanner(false)}
      isRightDrawerOpen={isRightDrawerOpen}
      onToggleRightDrawer={() => setIsRightDrawerOpen(!isRightDrawerOpen)}
      onCloseRightDrawer={() => setIsRightDrawerOpen(false)}
      filteredMessages={filteredMessages}
      copiedMessageId={copiedMessageId}
      activeReactionPickerId={activeReactionPickerId}
      messagesEndRef={messagesEndRef}
      onReply={setReplyingTo}
      onTogglePin={handleTogglePin}
      onCopyCiphertext={handleCopyCiphertext}
      onDelete={handleDeleteMessage}
      onAddReaction={handleAddReaction}
      onToggleReactionPicker={(id) =>
        setActiveReactionPickerId(activeReactionPickerId === id ? null : id)
      }
      onOpenLightbox={setLightboxImage}
      onCloseLightbox={() => setLightboxImage(null)}
      lightboxImage={lightboxImage}
      onQuickMessage={handleQuickMessage}
      typingStatus={typingStatus}
      input={input}
      onInputChange={handleInputChange}
      onSubmitMessage={handleSendMessage}
      replyingTo={replyingTo}
      onCancelReply={() => setReplyingTo(null)}
      selectedFile={selectedFile}
      onRemoveFile={() => {
        setSelectedFile(null);
        setEncryptedFilePayload(null);
      }}
      onFileSelect={handleFileSelection}
      isRecording={isRecording}
      recordingDuration={recordingDuration}
      onStartRecording={startRecording}
      onStopRecording={stopRecording}
      onCancelRecording={cancelRecording}
      createRoomModal={createRoomModal}
      onCloseCreateRoomModal={() => setCreateRoomModal(false)}
      onOpenCreateRoomModal={() => setCreateRoomModal(true)}
      newRoomData={newRoomData}
      onNewRoomDataChange={setNewRoomData}
      onCreateRoomSubmit={handleCreateRoom}
      keyModalUser={keyModalUser}
      onCloseKeyModal={() => setKeyModalUser(null)}
      onOpenKeyModal={() =>
        setKeyModalUser({ username: authUser.username, fingerprint: myFingerprint })
      }
      onVerifyUser={handleVerifyUser}
      showCommandsHelp={showCommandsHelp}
      onCloseCommandsHelp={() => setShowCommandsHelp(false)}
      onOpenCommandsHelp={() => setShowCommandsHelp(true)}
    />
  );
}
