import React, { useMemo } from 'react';
import { Message } from '../../types/chat';
import {
  Copy,
  ExternalLink,
  Maximize2,
  FileText,
  Smile,
  CheckCheck,
  Check,
  CornerDownRight,
  Pin,
  Trash2,
} from 'lucide-react';
import { AudioMessagePlayer } from './AudioMessagePlayer';

export const EMOJI_REACTIONS = ['👍', '❤️', '🔥', '🚀', '🎉', '👏', '😮', '😂', '👀', '💎'];

// Markdown Parser Helper for Code Blocks & Links
export function formatMessageContent(content?: string | null) {
  if (!content) return null;

  const codeBlockRegex = /```([a-zA-Z]*)\n([\s\S]*?)```/g;
  const parts: Array<{ type: 'text' | 'codeblock'; value: string; lang?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

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
            <div
              key={pIdx}
              className="rounded-xl overflow-hidden bg-black/60 border border-white/10 my-2 font-mono text-xs shadow-inner"
            >
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

interface MessageBubbleProps {
  msg: Message;
  isSentByMe: boolean;
  isPinned: boolean;
  copiedMessageId: string | null;
  activeReactionPickerId: string | null;
  onReply: (msg: Message) => void;
  onTogglePin: (msg: Message) => void;
  onCopyCiphertext: (msg: Message) => void;
  onDelete: (messageId: string) => void;
  onAddReaction: (messageId: string, emoji: string) => void;
  onToggleReactionPicker: (messageId: string) => void;
  onOpenLightbox: (url: string) => void;
}

export const MessageBubble = React.memo(function MessageBubble({
  msg,
  isSentByMe,
  isPinned,
  copiedMessageId,
  activeReactionPickerId,
  onReply,
  onTogglePin,
  onCopyCiphertext,
  onDelete,
  onAddReaction,
  onToggleReactionPicker,
  onOpenLightbox,
}: MessageBubbleProps) {
  const formattedContent = useMemo(() => formatMessageContent(msg.message), [msg.message]);

  return (
    <div
      className={`flex gap-3 max-w-[85%] sm:max-w-[75%] group relative ${
        isSentByMe ? 'self-end flex-row-reverse' : 'self-start'
      }`}
    >
      {/* User Avatar */}
      <img
        src={`https://api.dicebear.com/7.x/bottts/svg?seed=${msg.author || 'User'}`}
        alt="Avatar"
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-purple-500/30 shrink-0 bg-gray-900 mt-1 shadow-md"
      />

      {/* Message Bubble Card */}
      <div
        className={`p-4 rounded-2xl border backdrop-blur-xl shadow-xl flex flex-col gap-2 relative transition-all ${
          isSentByMe
            ? 'bg-gradient-to-r from-purple-950/80 via-indigo-950/80 to-purple-900/70 border-purple-500/40 rounded-tr-sm text-white shadow-purple-950/30'
            : 'bg-gray-900/90 border-white/10 rounded-tl-sm text-gray-100'
        }`}
      >
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
        <div
          className={`text-sm leading-relaxed ${
            msg.isDeleted ? 'italic text-gray-500' : 'text-gray-100'
          }`}
        >
          {formattedContent}
        </div>

        {/* Voice Note Attachment Player */}
        {msg.mediaUrl && msg.mediaUrl.startsWith('data:audio') && (
          <AudioMessagePlayer audioUrl={msg.mediaUrl} />
        )}

        {/* Image Attachment with Lightbox */}
        {msg.mediaUrl && msg.mediaUrl.startsWith('data:image') && !msg.isDeleted && (
          <div
            onClick={() => onOpenLightbox(msg.mediaUrl!)}
            className="mt-2 rounded-xl overflow-hidden border border-white/10 cursor-pointer group/img relative"
          >
            <img
              src={msg.mediaUrl}
              alt="Attachment"
              className="max-w-[280px] max-h-[220px] object-cover block group-hover/img:scale-105 transition-transform"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
              <Maximize2 size={20} />
            </div>
          </div>
        )}

        {/* Document Attachment */}
        {msg.mediaUrl &&
          !msg.mediaUrl.startsWith('data:image') &&
          !msg.mediaUrl.startsWith('data:audio') && (
            <div className="mt-2 p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-2 truncate">
                <FileText size={18} className="text-purple-400 shrink-0" />
                <span className="truncate font-semibold">{msg.fileName || 'Encrypted Payload'}</span>
              </div>
              {msg.fileSize && (
                <span className="text-[10px] text-gray-500 font-mono">
                  {(msg.fileSize / 1024).toFixed(1)} KB
                </span>
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
                onClick={() => onAddReaction(msg.id, emoji)}
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
              {['👍', '❤️', '🔥', '🚀'].map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => onAddReaction(msg.id, emoji)}
                  className="w-6 h-6 rounded-lg hover:bg-white/10 flex items-center justify-center text-xs transition cursor-pointer"
                  title={`React ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onToggleReactionPicker(msg.id)}
                className="w-6 h-6 rounded-lg hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
                title="More Reactions"
              >
                <Smile size={13} />
              </button>
            </div>

            {/* Action Icons */}
            <div className="flex items-center gap-1 text-gray-400">
              {isSentByMe &&
                (msg.status === 'read' ? (
                  <CheckCheck size={14} className="text-cyan-400" title="Read" />
                ) : msg.status === 'acknowledged' ? (
                  <CheckCheck
                    size={14}
                    className="text-purple-400"
                    title="Acknowledged & Decrypted"
                  />
                ) : msg.status === 'delivered' ? (
                  <CheckCheck size={14} className="text-gray-400" title="Delivered" />
                ) : (
                  <Check size={14} className="text-gray-500" title="Queued on Mailbox" />
                ))}
              <button
                type="button"
                onClick={() => onReply(msg)}
                className="p-1 hover:text-purple-300 transition cursor-pointer"
                title="Reply to message"
              >
                <CornerDownRight size={12} />
              </button>
              <button
                type="button"
                onClick={() => onTogglePin(msg)}
                className={`p-1 transition cursor-pointer ${
                  isPinned ? 'text-amber-400' : 'hover:text-white'
                }`}
                title={isPinned ? 'Unpin message' : 'Pin message'}
              >
                <Pin size={12} />
              </button>
              <button
                type="button"
                onClick={() => onCopyCiphertext(msg)}
                className="p-1 hover:text-white transition cursor-pointer"
                title="Copy Ciphertext"
              >
                {copiedMessageId === msg.id ? (
                  <Check size={12} className="text-emerald-400" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
              {isSentByMe && (
                <button
                  type="button"
                  onClick={() => onDelete(msg.id)}
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
            {EMOJI_REACTIONS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                onClick={() => onAddReaction(msg.id, emoji)}
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
});
