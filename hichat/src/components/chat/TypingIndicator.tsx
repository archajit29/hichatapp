import React from 'react';

interface TypingIndicatorProps {
  typingStatus: Set<string>;
}

export function TypingIndicator({ typingStatus }: TypingIndicatorProps) {
  if (typingStatus.size === 0) return null;

  return (
    <div className="px-6 py-1.5 text-xs text-purple-300 italic flex items-center gap-2 bg-purple-950/30 border-t border-purple-500/20 font-mono shrink-0">
      <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
      <span>
        {Array.from(typingStatus).join(', ')} {typingStatus.size === 1 ? 'is' : 'are'} typing...
      </span>
    </div>
  );
}
