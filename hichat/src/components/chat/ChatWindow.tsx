import React from 'react';
import { Message } from '../../types/chat';
import { User } from '../../types/user';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { TypingIndicator } from './TypingIndicator';
import { MessageInput } from './MessageInput';

interface ChatWindowProps {
  activeTab: 'channel' | 'dm';
  activeRoom: string;
  activeDMUser: User | null;
  activeRoomDescription?: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  pinnedMessages: Message[];
  showPinnedBanner: boolean;
  onTogglePinnedBanner: () => void;
  onClosePinnedBanner: () => void;
  onOpenSidebar: () => void;
  onToggleRightDrawer: () => void;
  filteredMessages: Message[];
  currentUsername?: string;
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
  onQuickMessage: (text: string) => void;
  typingStatus: Set<string>;
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
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
}

export const ChatWindow = React.memo(function ChatWindow({
  activeTab,
  activeRoom,
  activeDMUser,
  activeRoomDescription,
  searchQuery,
  onSearchChange,
  pinnedMessages,
  showPinnedBanner,
  onTogglePinnedBanner,
  onClosePinnedBanner,
  onOpenSidebar,
  onToggleRightDrawer,
  filteredMessages,
  currentUsername,
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
  onQuickMessage,
  typingStatus,
  input,
  onInputChange,
  onSubmit,
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
}: ChatWindowProps) {
  const placeholder =
    activeTab === 'channel'
      ? `Message #${activeRoom} (type /help for commands)...`
      : `Message @${activeDMUser?.username}...`;

  return (
    <main className="chat-main flex-1 flex flex-col h-full relative bg-[#070913] min-w-0 overflow-hidden">
      <ChatHeader
        activeTab={activeTab}
        activeRoom={activeRoom}
        activeDMUser={activeDMUser}
        activeRoomDescription={activeRoomDescription}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        pinnedCount={pinnedMessages.length}
        showPinnedBanner={showPinnedBanner}
        onTogglePinnedBanner={onTogglePinnedBanner}
        onOpenSidebar={onOpenSidebar}
        onToggleRightDrawer={onToggleRightDrawer}
      />

      <MessageList
        messages={filteredMessages}
        currentUsername={currentUsername}
        pinnedMessages={pinnedMessages}
        showPinnedBanner={showPinnedBanner}
        onClosePinnedBanner={onClosePinnedBanner}
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
      />

      <TypingIndicator typingStatus={typingStatus} />

      <MessageInput
        input={input}
        onInputChange={onInputChange}
        onSubmit={onSubmit}
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
        placeholder={placeholder}
      />
    </main>
  );
});
