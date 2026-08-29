import React from 'react';
import { Plus } from 'lucide-react';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomData: { name: string; description: string };
  onRoomDataChange: (data: { name: string; description: string }) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function CreateRoomModal({
  isOpen,
  onClose,
  roomData,
  onRoomDataChange,
  onSubmit,
}: CreateRoomModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-purple-500/30 p-6 rounded-3xl w-full max-w-md shadow-2xl animate-fadeIn">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Plus size={20} className="text-purple-400" />
          <span>Create Encrypted Channel</span>
        </h2>
        <p className="text-xs text-gray-400 mb-5">
          Channels provide real-time zero-knowledge message broadcast.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Channel Name
            </label>
            <input
              type="text"
              placeholder="e.g. quantum-research"
              className="w-full px-4 py-3 rounded-xl bg-gray-950 border border-gray-800 focus:border-purple-500 text-white text-sm focus:outline-none"
              value={roomData.name}
              onChange={(e) => onRoomDataChange({ ...roomData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Description
            </label>
            <input
              type="text"
              placeholder="Topic and team focus"
              className="w-full px-4 py-3 rounded-xl bg-gray-950 border border-gray-800 focus:border-purple-500 text-white text-sm focus:outline-none"
              value={roomData.description}
              onChange={(e) => onRoomDataChange({ ...roomData, description: e.target.value })}
            />
          </div>

          <div className="flex gap-3 justify-end pt-3">
            <button
              type="button"
              className="px-5 py-2.5 rounded-xl bg-gray-800 text-gray-300 font-semibold text-xs hover:bg-gray-700 transition cursor-pointer"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs hover:from-purple-500 hover:to-indigo-500 transition shadow-lg shadow-purple-600/30 cursor-pointer"
            >
              Create Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
