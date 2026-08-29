import React from 'react';
import { ActiveUser } from '../../types/chat';
import { User } from '../../types/user';
import { ShieldCheck, Lock, Key, Code } from 'lucide-react';

interface SecurityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'channel' | 'dm';
  activeRoom: string;
  activeDMUser: User | null;
  activeUsersMap: Map<string, ActiveUser>;
  onVerifyUser: (user: ActiveUser) => void;
  onVerifySelf: () => void;
  onOpenCommandsHelp: () => void;
}

export function SecurityDrawer({
  isOpen,
  onClose,
  activeTab,
  activeRoom,
  activeDMUser,
  activeUsersMap,
  onVerifyUser,
  onVerifySelf,
  onOpenCommandsHelp,
}: SecurityDrawerProps) {
  if (!isOpen) return null;

  return (
    <aside className="w-80 bg-[#090d1a]/95 border-l border-white/10 p-5 flex flex-col gap-5 backdrop-blur-2xl shrink-0 overflow-y-auto min-h-0 h-full animate-fadeIn z-30">
      <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <ShieldCheck size={17} className="text-purple-400" />
          <span>Security & Info</span>
        </h3>
        <button
          type="button"
          className="text-gray-400 hover:text-white font-bold text-sm cursor-pointer"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Channel Overview Card */}
      <div className="p-4 rounded-2xl bg-gray-900/80 border border-purple-500/30 space-y-2 shrink-0">
        <div className="font-bold text-sm text-purple-300">
          {activeTab === 'channel' ? `#${activeRoom}` : `@${activeDMUser?.username}`}
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          Protected by Web Crypto API with 256-bit AES-GCM encryption derived via ECDH Curve P-256.
        </p>
        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-emerald-400">
          <span>● Status: Secure & Verified</span>
          <Lock size={12} />
        </div>
      </div>

      {/* Active Members in Room */}
      <div className="shrink-0">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center justify-between">
          <span>Channel Members</span>
          <span className="text-[10px] text-purple-400 font-mono">
            {activeUsersMap.size} Active
          </span>
        </div>

        <div className="space-y-2">
          {Array.from(activeUsersMap.values()).map((u) => (
            <div
              key={u.socketId}
              className="p-3 rounded-xl bg-gray-900/60 border border-white/10 hover:border-purple-500/40 cursor-pointer flex items-center justify-between transition group"
              onClick={() => onVerifyUser(u)}
            >
              <div className="flex items-center gap-2.5">
                <img
                  src={`https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`}
                  alt="Avatar"
                  className="w-7 h-7 rounded-full border border-purple-500/30"
                />
                <div className="text-xs text-white font-medium group-hover:text-purple-300 transition">
                  {u.username}
                </div>
              </div>
              <span
                className={`text-[10px] font-mono ${
                  u.status === 'online' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                ● {u.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Security Tools */}
      <div className="pt-3 border-t border-white/10 space-y-2 shrink-0">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
          Vault Utilities
        </div>
        <button
          type="button"
          onClick={onVerifySelf}
          className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-300 hover:text-white flex items-center gap-2 transition text-left cursor-pointer"
        >
          <Key size={14} className="text-purple-400" />
          <span>Verify Cryptographic Fingerprint</span>
        </button>
        <button
          type="button"
          onClick={onOpenCommandsHelp}
          className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-300 hover:text-white flex items-center gap-2 transition text-left cursor-pointer"
        >
          <Code size={14} className="text-cyan-400" />
          <span>Quick Slash Commands Guide</span>
        </button>
      </div>
    </aside>
  );
}
