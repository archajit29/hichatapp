import React from 'react';
import { Message } from '../../types/chat';
import { CornerDownRight, X, Paperclip, Mic, Send } from 'lucide-react';
import { AttachmentPreview } from './AttachmentPreview';

interface MessageInputProps {
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
  placeholder: string;
}

export function MessageInput({
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
  placeholder,
}: MessageInputProps) {
  return (
    <>
      {/* Reply Quote Banner */}
      {replyingTo && (
        <div className="px-6 py-2 bg-purple-950/70 border-t border-purple-500/30 flex items-center justify-between text-xs text-purple-200 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <CornerDownRight size={14} className="text-purple-400 shrink-0" />
            <span>
              Replying to <strong className="text-white">@{replyingTo.author}</strong>:{' '}
              <span className="italic">{replyingTo.message?.substring(0, 50)}...</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Attachment Preview Banner */}
      {selectedFile && <AttachmentPreview file={selectedFile} onRemove={onRemoveFile} />}

      {/* Input Bar with Voice Note & Media Upload */}
      <div className="p-3 sm:p-4 border-t border-white/10 bg-[#090d1a]/95 backdrop-blur-xl shrink-0">
        {isRecording ? (
          /* Voice Recording Dock */
          <div className="flex items-center justify-between gap-4 p-3 rounded-2xl bg-rose-950/40 border border-rose-500/40 animate-pulse">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
              <span className="text-xs font-bold text-rose-300 font-mono">
                Recording Voice Note: {Math.floor(recordingDuration / 60)}:
                {(recordingDuration % 60).toString().padStart(2, '0')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancelRecording}
                className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onStopRecording}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow cursor-pointer"
              >
                Done & Send
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex items-center gap-2 sm:gap-3">
            {/* Attach File Button */}
            <label
              className="p-2.5 sm:p-3 rounded-xl bg-gray-900 border border-white/10 hover:border-purple-500/40 text-gray-400 hover:text-white cursor-pointer transition shrink-0 shadow-sm"
              title="Attach file or media"
            >
              <Paperclip size={18} />
              <input type="file" className="hidden" onChange={onFileSelect} />
            </label>

            {/* Record Audio Button */}
            <button
              type="button"
              onClick={onStartRecording}
              className="p-2.5 sm:p-3 rounded-xl bg-gray-900 border border-white/10 hover:border-purple-500/40 text-gray-400 hover:text-white transition shrink-0 shadow-sm cursor-pointer"
              title="Record Voice Note"
            >
              <Mic size={18} />
            </button>

            {/* Text Input */}
            <input
              type="text"
              placeholder={placeholder}
              className="flex-1 px-4 py-3 rounded-xl bg-gray-950/80 border border-gray-800 focus:border-purple-500 text-sm text-white focus:outline-none transition placeholder-gray-500 font-sans shadow-inner"
              value={input}
              onChange={onInputChange}
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
    </>
  );
}
