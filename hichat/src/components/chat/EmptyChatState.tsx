import React from 'react';
import { Sparkles } from 'lucide-react';

interface EmptyChatStateProps {
  onQuickMessage?: (text: string) => void;
}

export function EmptyChatState({ onQuickMessage }: EmptyChatStateProps) {
  return (
    <div className="text-center my-auto p-8 rounded-3xl bg-gray-900/40 border border-white/5 backdrop-blur-md max-w-sm mx-auto shadow-2xl">
      <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 mx-auto mb-3 shadow-lg shadow-purple-600/20">
        <Sparkles size={28} className="animate-pulse" />
      </div>
      <h3 className="font-extrabold text-white text-lg mb-1">Encrypted Session Ready</h3>
      <p className="text-xs text-gray-400 font-light leading-relaxed">
        Messages in this channel are encrypted client-side using Web Crypto ECDH key derivation before reaching the network.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => onQuickMessage?.('Hello team! 🚀 Encrypted chat is up and running.')}
          className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg text-purple-300 transition cursor-pointer"
        >
          "Hello team! 🚀"
        </button>
      </div>
    </div>
  );
}
