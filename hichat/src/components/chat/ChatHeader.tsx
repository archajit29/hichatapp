import React from 'react';
import { User } from '../../types/user';
import { Menu, Hash, User as UserIcon, Search, Pin, Users } from 'lucide-react';

interface ChatHeaderProps {
  activeTab: 'channel' | 'dm';
  activeRoom: string;
  activeDMUser: User | null;
  activeRoomDescription?: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  pinnedCount: number;
  showPinnedBanner: boolean;
  onTogglePinnedBanner: () => void;
  onOpenSidebar: () => void;
  onToggleRightDrawer: () => void;
}

export const ChatHeader = React.memo(function ChatHeader({
  activeTab,
  activeRoom,
  activeDMUser,
  activeRoomDescription,
  searchQuery,
  onSearchChange,
  pinnedCount,
  showPinnedBanner,
  onTogglePinnedBanner,
  onOpenSidebar,
  onToggleRightDrawer,
}: ChatHeaderProps) {
  return (
    <header className="px-4 sm:px-6 py-3.5 border-b border-white/10 bg-[#090d1a]/85 backdrop-blur-xl flex items-center justify-between z-10 shadow-lg shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="md:hidden p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer"
        >
          <Menu size={20} />
        </button>

        <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 font-bold shadow-md shadow-purple-950/50 shrink-0">
          {activeTab === 'channel' ? <Hash size={20} /> : <UserIcon size={20} />}
        </div>

        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-white flex items-center gap-2 truncate">
            <span>{activeTab === 'channel' ? `#${activeRoom}` : `@${activeDMUser?.username}`}</span>
            {activeTab === 'channel' && (
              <span className="text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                E2EE LIVE
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-400 font-light truncate">
            {activeTab === 'channel'
              ? activeRoomDescription
              : `Secure direct message channel with @${activeDMUser?.username}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Search Bar */}
        <div className="relative hidden sm:block">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search messages..."
            className="pl-8 pr-3 py-1.5 rounded-xl bg-gray-950/80 border border-gray-800 focus:border-purple-500 text-xs text-white focus:outline-none transition w-36 lg:w-48 font-sans"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Pinned Messages Trigger */}
        {pinnedCount > 0 && (
          <button
            type="button"
            onClick={onTogglePinnedBanner}
            className="p-2 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-300 hover:text-white transition text-xs flex items-center gap-1.5 font-semibold cursor-pointer"
            title="View Pinned Messages"
          >
            <Pin size={14} />
            <span className="hidden sm:inline">{pinnedCount} Pinned</span>
          </button>
        )}

        {/* Member Inspector Trigger */}
        <button
          type="button"
          className="p-2 rounded-xl bg-gray-900 border border-white/10 hover:border-purple-500/40 text-gray-300 transition shadow-sm cursor-pointer"
          onClick={onToggleRightDrawer}
          title="Chat Info & Security"
        >
          <Users size={17} />
        </button>
      </div>
    </header>
  );
});
