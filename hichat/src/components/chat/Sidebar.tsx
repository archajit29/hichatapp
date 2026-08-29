import React from 'react';
import { Link } from 'react-router-dom';
import { Conversation, ActiveUser, UserStatusType } from '../../types/chat';
import { User } from '../../types/user';
import {
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
  ChevronDown,
  LogOut,
  Plus,
  Key,
} from 'lucide-react';
import { ConversationItem } from './ConversationItem';

interface SidebarProps {
  authUser: User;
  userStatus: UserStatusType;
  statusDropdown: boolean;
  onToggleStatusDropdown: () => void;
  onStatusChange: (status: UserStatusType) => void;
  myFingerprint: string;
  isSidebarOpen: boolean;
  onCloseSidebar: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onLogout: () => void;
  rooms: Conversation[];
  activeTab: 'channel' | 'dm';
  activeRoom: string;
  unreadCounts: Record<string, number>;
  onSelectChannel: (roomId: string) => void;
  onOpenCreateRoomModal: () => void;
  allUsers: User[];
  activeDMUser: User | null;
  activeUsersMap: Map<string, ActiveUser>;
  onSelectDM: (user: User) => void;
  onOpenKeyModal: () => void;
}

export const Sidebar = React.memo(function Sidebar({
  authUser,
  userStatus,
  statusDropdown,
  onToggleStatusDropdown,
  onStatusChange,
  myFingerprint,
  isSidebarOpen,
  onCloseSidebar,
  soundEnabled,
  onToggleSound,
  onLogout,
  rooms,
  activeTab,
  activeRoom,
  unreadCounts,
  onSelectChannel,
  onOpenCreateRoomModal,
  allUsers,
  activeDMUser,
  activeUsersMap,
  onSelectDM,
  onOpenKeyModal,
}: SidebarProps) {
  return (
    <aside
      className={`sidebar w-72 sm:w-80 bg-[#090d1a]/95 border-r border-white/10 flex flex-col shrink-0 backdrop-blur-2xl transition-all z-30 h-full ${
        isSidebarOpen ? 'fixed inset-y-0 left-0 shadow-2xl' : 'hidden md:flex'
      }`}
    >
      {/* Sidebar Header */}
      <div className="sidebar-header border-b border-white/10 px-5 py-4 flex items-center justify-between bg-black/20 shrink-0">
        <Link
          to="/"
          className="flex items-center gap-2.5 font-black text-lg bg-gradient-to-r from-purple-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent group"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-purple-600/30 group-hover:scale-105 transition-transform">
            <ShieldCheck size={18} />
          </div>
          <span>
            hichat{' '}
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-purple-950 border border-purple-500/30 text-purple-400">
              PRO
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleSound}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
          >
            {soundEnabled ? (
              <Volume2 size={16} className="text-purple-400" />
            ) : (
              <VolumeX size={16} className="text-gray-500" />
            )}
          </button>
          {isSidebarOpen && (
            <button
              type="button"
              onClick={onCloseSidebar}
              className="md:hidden p-2 text-gray-400 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* User Profile Bar with Status Badging */}
      <div className="relative px-4 py-3.5 bg-white/[0.02] border-b border-white/10 flex items-center gap-3 shrink-0">
        <div className="relative">
          <img
            src={
              authUser.avatarUrl ||
              `https://api.dicebear.com/7.x/bottts/svg?seed=${authUser.username}`
            }
            alt="Avatar"
            className="w-10 h-10 rounded-full border-2 border-purple-500/50 object-cover bg-gray-900 shadow-md"
          />
          <span
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#090d1a] ${
              userStatus === 'online'
                ? 'bg-emerald-400 shadow-sm shadow-emerald-400'
                : userStatus === 'away'
                ? 'bg-amber-400'
                : 'bg-rose-500'
            }`}
          />
        </div>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleStatusDropdown}>
          <div className="font-bold text-sm text-white flex items-center gap-1.5 truncate">
            <span className="truncate">{authUser.username}</span>
            <ChevronDown size={13} className="text-gray-400 shrink-0" />
          </div>
          <div className="text-[11px] text-purple-400 font-semibold flex items-center gap-1 mt-0.5">
            <span>● {userStatus.toUpperCase()}</span>
            {myFingerprint && (
              <span className="text-[10px] text-gray-500 font-mono truncate">
                • {myFingerprint.substring(0, 10)}...
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          className="p-2 rounded-xl text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
          onClick={onLogout}
          title="Sign Out"
        >
          <LogOut size={16} />
        </button>

        {/* Status Dropdown Picker */}
        {statusDropdown && (
          <div className="absolute top-16 left-3 right-3 bg-gray-900 border border-purple-500/30 rounded-2xl p-2 z-50 shadow-2xl backdrop-blur-2xl">
            <div
              className="p-2.5 rounded-xl hover:bg-purple-600/20 cursor-pointer flex items-center gap-2.5 text-xs text-gray-200 transition"
              onClick={() => onStatusChange('online')}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="font-medium">Online (Active)</span>
            </div>
            <div
              className="p-2.5 rounded-xl hover:bg-purple-600/20 cursor-pointer flex items-center gap-2.5 text-xs text-gray-200 transition"
              onClick={() => onStatusChange('away')}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="font-medium">Away (AFK)</span>
            </div>
            <div
              className="p-2.5 rounded-xl hover:bg-purple-600/20 cursor-pointer flex items-center gap-2.5 text-xs text-gray-200 transition"
              onClick={() => onStatusChange('dnd')}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="font-medium">Do Not Disturb</span>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar Nav List */}
      <div className="p-3 flex-1 overflow-y-auto min-h-0 flex flex-col gap-4">
        {/* Channels Section */}
        <div>
          <div className="flex items-center justify-between px-2 pb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Encrypted Channels
            </span>
            <button
              type="button"
              className="p-1 rounded-lg text-purple-400 hover:text-white hover:bg-purple-600/20 transition cursor-pointer"
              onClick={onOpenCreateRoomModal}
              title="Create New Channel"
            >
              <Plus size={15} />
            </button>
          </div>

          <div className="space-y-1">
            {rooms.map((room) => {
              const unread = unreadCounts[room.id] || 0;
              const isCurrent = activeTab === 'channel' && activeRoom === room.id;

              return (
                <ConversationItem
                  key={room.id}
                  type="channel"
                  room={room}
                  isCurrent={isCurrent}
                  unread={unread}
                  onClick={() => onSelectChannel(room.id)}
                />
              );
            })}
          </div>
        </div>

        {/* Direct Messages Section */}
        <div>
          <div className="flex items-center justify-between px-2 pb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Direct Messages
            </span>
            <span className="text-[10px] text-gray-500 font-mono">{allUsers.length} Users</span>
          </div>

          <div className="space-y-1">
            {allUsers
              .filter((u) => u.username !== authUser.username)
              .map((userObj) => {
                const isCurrentDM = activeTab === 'dm' && activeDMUser?.username === userObj.username;
                const isOnline = Array.from(activeUsersMap.values()).some(
                  (u) => u.username === userObj.username
                );

                return (
                  <ConversationItem
                    key={userObj.id}
                    type="dm"
                    user={userObj}
                    isCurrent={isCurrentDM}
                    isOnline={isOnline}
                    onClick={() => onSelectDM(userObj)}
                  />
                );
              })}
          </div>
        </div>
      </div>

      {/* Security & Key Verification Footer */}
      <div className="p-3 border-t border-white/10 bg-black/30 text-center shrink-0">
        <button
          type="button"
          onClick={onOpenKeyModal}
          className="w-full py-2 px-3 rounded-xl bg-purple-950/40 hover:bg-purple-900/40 border border-purple-500/30 text-purple-300 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Key size={13} />
          <span>ECDH Safety Fingerprint</span>
        </button>
      </div>
    </aside>
  );
});
