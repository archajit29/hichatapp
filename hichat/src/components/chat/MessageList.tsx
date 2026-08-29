import React from 'react';
import { Message } from '../../types/chat';
import { Pin, X } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { EmptyChatState } from './EmptyChatState';

interface MessageListProps {
  messages: Message[];
  currentUsername?: string;
  pinnedMessages: Message[];
  showPinnedBanner: boolean;
  onClosePinnedBanner: () => void;
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
}

export const MessageList = React.memo(function MessageList({
  messages,
  currentUsername,
  pinnedMessages,
  showPinnedBanner,
  onClosePinnedBanner,
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
}: MessageListProps) {
  return (
    <>
      {/* Pinned Messages Header Dropdown */}
      {showPinnedBanner && pinnedMessages.length > 0 && (
        <div className="bg-purple-950/80 border-b border-purple-500/30 px-6 py-2.5 backdrop-blur-xl flex items-center justify-between text-xs text-purple-200 z-10 animate-fadeIn shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <Pin size={14} className="text-purple-400 shrink-0" />
            <span className="font-bold text-white">Pinned:</span>
            <span className="truncate italic">
              "{pinnedMessages[pinnedMessages.length - 1].message}"
            </span>
          </div>
          <button
            type="button"
            onClick={onClosePinnedBanner}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Message Stream */}
      <div className="chat-messages flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 flex flex-col gap-4">
        {messages.length === 0 ? (
          <EmptyChatState onQuickMessage={onQuickMessage} />
        ) : (
          messages.map((msg, index) => {
            const isSentByMe = msg.author === currentUsername;
            const isPinned = pinnedMessages.some((p) => p.id === msg.id);

            return (
              <MessageBubble
                key={msg.id || `msg-${index}`}
                msg={msg}
                isSentByMe={isSentByMe}
                isPinned={isPinned}
                copiedMessageId={copiedMessageId}
                activeReactionPickerId={activeReactionPickerId}
                onReply={onReply}
                onTogglePin={onTogglePin}
                onCopyCiphertext={onCopyCiphertext}
                onDelete={onDelete}
                onAddReaction={onAddReaction}
                onToggleReactionPicker={onToggleReactionPicker}
                onOpenLightbox={onOpenLightbox}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
    </>
  );
});
