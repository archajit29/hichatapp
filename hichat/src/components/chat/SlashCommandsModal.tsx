import React from 'react';
import { Code, X } from 'lucide-react';

interface SlashCommandsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SlashCommandsModal = React.memo(function SlashCommandsModal({ isOpen, onClose }: SlashCommandsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-purple-500/40 p-6 rounded-3xl w-full max-w-md shadow-2xl animate-fadeIn">
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <Code size={18} className="text-cyan-400" />
            <span>Slash Commands</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2.5 text-xs text-gray-300 font-mono">
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
            <span className="text-purple-300">/help</span>
            <span className="text-gray-400 font-sans">Show commands modal</span>
          </div>
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
            <span className="text-purple-300">/clear</span>
            <span className="text-gray-400 font-sans">Clear local message feed</span>
          </div>
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
            <span className="text-purple-300">/shrug</span>
            <span className="text-gray-400 font-sans">Append ¯\_(ツ)_/¯</span>
          </div>
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
            <span className="text-purple-300">/flip</span>
            <span className="text-gray-400 font-sans">Append (╯°□°)╯︵ ┻━┻</span>
          </div>
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
            <span className="text-purple-300">/status &lt;online|away|dnd&gt;</span>
            <span className="text-gray-400 font-sans">Update status</span>
          </div>
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
            <span className="text-purple-300">/keys</span>
            <span className="text-gray-400 font-sans">View E2EE keys</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>
  );
});
