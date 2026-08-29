import React from 'react';
import { User } from '../../types/user';
import { Conversation, ActiveUser, UserStatusType, Message } from '../../types/chat';
import { Sidebar } from './Sidebar';
import { ChatWindow } from './ChatWindow';
import { SecurityDrawer } from './SecurityDrawer';
import { CreateRoomModal } from './CreateRoomModal';
import { SecurityFingerprintModal } from './SecurityFingerprintModal';
import { SlashCommandsModal } from './SlashCommandsModal';
import { ImageLightboxModal } from './ImageLightboxModal';

interface ChatLayoutProps {
  authUser: User;
  myFingerprint: string;
  isSidebarOpen: boolean;
  onCloseSidebar: () => void;
  onOpenSidebar: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onLogout: () => void;
  userStatus: UserStatusType;
  statusDropdown: boolean;
  onToggleStatusDropdown: () => void;
  onStatusChange: (status: UserStatusType) => void;
  rooms: Conversation[];
  activeTab: 'channel' | 'dm';
  activeRoom: string;
  activeDMUser: User | null;
  activeRoomDescription?: string | null;
  unreadCounts: Record<string, number>;
  onSelectChannel: (roomId: string) => void;
  onSelectDM: (user: User) => void;
  allUsers: User[];
  activeUsersMap: Map<string, ActiveUser>;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  pinnedMessages: Message[];
  showPinnedBanner: boolean;
  onTogglePinnedBanner: () => void;
  onClosePinnedBanner: () => void;
  isRightDrawerOpen: boolean;
  onToggleRightDrawer: () => void;
  onCloseRightDrawer: () => void;
  filteredMessages: Message[];
  copiedMessageId: string | null;
  activeReactionPickerId: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onReply: (msg: Message) => void;
  onTogglePin: (msg: Message) => void;
  onCopyCiphertext: (msg: Message) => void;
  onDelete: (messageId: string) => void;
  onAddReaction: (messageId: string, emoji: string) => void;
  onToggleReactionPicker: (messageId: string) => void;
  onOpenLightbox: (url: string) => void;
  onCloseLightbox: () => void;
  lightboxImage: string | null;
  onQuickMessage: (text: string) => void;
  typingStatus: Set<string>;
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmitMessage: (e: React.FormEvent) => void;
  replyingTo: Message | null;
  onCancelReply: () => void;
  selectedFile: any;
  onRemoveFile: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isRecording: boolean;
  recordingDuration: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  createRoomModal: boolean;
  onCloseCreateRoomModal: () => void;
  onOpenCreateRoomModal: () => void;
  newRoomData: { name: string; description: string };
  onNewRoomDataChange: (data: { name: string; description: string }) => void;
  onCreateRoomSubmit: (e: React.FormEvent) => void;
  keyModalUser: { username: string; fingerprint: string } | null;
  onCloseKeyModal: () => void;
  onOpenKeyModal: () => void;
  onVerifyUser: (user: ActiveUser) => void;
  showCommandsHelp: boolean;
  onCloseCommandsHelp: () => void;
  onOpenCommandsHelp: () => void;
}

export const ChatLayout = React.memo(function ChatLayout({
  authUser,
  myFingerprint,
  isSidebarOpen,
  onCloseSidebar,
  onOpenSidebar,
  soundEnabled,
  onToggleSound,
  onLogout,
  userStatus,
  statusDropdown,
  onToggleStatusDropdown,
  onStatusChange,
  rooms,
  activeTab,
  activeRoom,
  activeDMUser,
  activeRoomDescription,
  unreadCounts,
  onSelectChannel,
  onSelectDM,
  allUsers,
  activeUsersMap,
  searchQuery,
  onSearchChange,
  pinnedMessages,
  showPinnedBanner,
  onTogglePinnedBanner,
  onClosePinnedBanner,
  isRightDrawerOpen,
  onToggleRightDrawer,
  onCloseRightDrawer,
  filteredMessages,
  copiedMessageId,
  activeReactionPickerId,
  messagesEndRef,
  onReply,
  onTogglePin,
  onCopyCiphertext,
  onDelete,
  onAddReaction,
  onToggleReactionPicker,
  onOpenLightbox,
  onCloseLightbox,
  lightboxImage,
  onQuickMessage,
  typingStatus,
  input,
  onInputChange,
  onSubmitMessage,
  replyingTo,
  onCancelReply,
  selectedFile,
  onRemoveFile,
  onFileSelect,
  isRecording,
  recordingDuration,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  createRoomModal,
  onCloseCreateRoomModal,
  onOpenCreateRoomModal,
  newRoomData,
  onNewRoomDataChange,
  onCreateRoomSubmit,
  keyModalUser,
  onCloseKeyModal,
  onOpenKeyModal,
  onVerifyUser,
  showCommandsHelp,
  onCloseCommandsHelp,
  onOpenCommandsHelp,
}: ChatLayoutProps) {
  return (
    <div className="app-container font-sans bg-[#070913] text-gray-100 flex h-screen w-screen overflow-hidden select-none">
      {/* 1. Left Sidebar Navigation */}
      <Sidebar
        authUser={authUser}
        userStatus={userStatus}
        statusDropdown={statusDropdown}
        onToggleStatusDropdown={onToggleStatusDropdown}
        onStatusChange={onStatusChange}
        myFingerprint={myFingerprint}
        isSidebarOpen={isSidebarOpen}
        onCloseSidebar={onCloseSidebar}
        soundEnabled={soundEnabled}
        onToggleSound={onToggleSound}
        onLogout={onLogout}
        rooms={rooms}
        activeTab={activeTab}
        activeRoom={activeRoom}
        unreadCounts={unreadCounts}
        onSelectChannel={onSelectChannel}
        onOpenCreateRoomModal={onOpenCreateRoomModal}
        allUsers={allUsers}
        activeDMUser={activeDMUser}
        activeUsersMap={activeUsersMap}
        onSelectDM={onSelectDM}
        onOpenKeyModal={onOpenKeyModal}
      />

      {/* 2. Main Workspace Feed Area */}
      <ChatWindow
        activeTab={activeTab}
        activeRoom={activeRoom}
        activeDMUser={activeDMUser}
        activeRoomDescription={activeRoomDescription}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        pinnedMessages={pinnedMessages}
        showPinnedBanner={showPinnedBanner}
        onTogglePinnedBanner={onTogglePinnedBanner}
        onClosePinnedBanner={onClosePinnedBanner}
        onOpenSidebar={onOpenSidebar}
        onToggleRightDrawer={onToggleRightDrawer}
        filteredMessages={filteredMessages}
        currentUsername={authUser.username}
        copiedMessageId={copiedMessageId}
        activeReactionPickerId={activeReactionPickerId}
        messagesEndRef={messagesEndRef}
        onReply={onReply}
        onTogglePin={onTogglePin}
        onCopyCiphertext={onCopyCiphertext}
        onDelete={onDelete}
        onAddReaction={onAddReaction}
        onToggleReactionPicker={onToggleReactionPicker}
        onOpenLightbox={onOpenLightbox}
        onQuickMessage={onQuickMessage}
        typingStatus={typingStatus}
        input={input}
        onInputChange={onInputChange}
        onSubmit={onSubmitMessage}
        replyingTo={replyingTo}
        onCancelReply={onCancelReply}
        selectedFile={selectedFile}
        onRemoveFile={onRemoveFile}
        onFileSelect={onFileSelect}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
        onCancelRecording={onCancelRecording}
      />

      {/* 3. Right Security & Chat Info Drawer */}
      <SecurityDrawer
        isOpen={isRightDrawerOpen}
        onClose={onCloseRightDrawer}
        activeTab={activeTab}
        activeRoom={activeRoom}
        activeDMUser={activeDMUser}
        activeUsersMap={activeUsersMap}
        onVerifyUser={onVerifyUser}
        onVerifySelf={onOpenKeyModal}
        onOpenCommandsHelp={onOpenCommandsHelp}
      />

      {/* 4. Create Group Modal */}
      <CreateRoomModal
        isOpen={createRoomModal}
        onClose={onCloseCreateRoomModal}
        roomData={newRoomData}
        onRoomDataChange={onNewRoomDataChange}
        onSubmit={onCreateRoomSubmit}
      />

      {/* 5. Cryptographic Security Fingerprint Modal */}
      <SecurityFingerprintModal user={keyModalUser} onClose={onCloseKeyModal} />

      {/* 6. Slash Commands Guide Modal */}
      <SlashCommandsModal isOpen={showCommandsHelp} onClose={onCloseCommandsHelp} />

      {/* 7. Image Lightbox Modal */}
      <ImageLightboxModal imageUrl={lightboxImage} onClose={onCloseLightbox} />
    </div>
  );
});
