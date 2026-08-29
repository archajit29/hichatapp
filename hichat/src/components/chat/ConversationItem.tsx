import React from 'react';
import { Conversation } from '../../types/chat';
import { User } from '../../types/user';
import { Hash } from 'lucide-react';

interface ChannelItemProps {
  type: 'channel';
  room: Conversation;
  isCurrent: boolean;
  unread?: number;
  onClick: () => void;
}

interface DMItemProps {
  type: 'dm';
  user: User;
  isCurrent: boolean;
  isOnline?: boolean;
  onClick: () => void;
}

type ConversationItemProps = ChannelItemProps | DMItemProps;

export function ConversationItem(props: ConversationItemProps) {
  if (props.type === 'channel') {
    const { room, isCurrent, unread = 0, onClick } = props;
    return (
      <div
        onClick={onClick}
        className={`px-3 py-2.5 rounded-xl cursor-pointer flex items-center gap-3 transition-all ${
          isCurrent
            ? 'bg-gradient-to-r from-purple-900/60 to-indigo-900/60 border border-purple-500/40 text-white font-bold shadow-md shadow-purple-950/40'
            : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
        }`}
      >
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
            isCurrent ? 'bg-purple-600 text-white' : 'bg-gray-800/80 text-gray-400'
          }`}
        >
          <Hash size={15} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">{room.name}</div>
          <div className="text-[10px] text-gray-500 truncate">{room.description}</div>
        </div>

        {unread > 0 && (
          <span className="bg-purple-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow shrink-0">
            {unread}
          </span>
        )}
      </div>
    );
  }

  const { user, isCurrent, isOnline = false, onClick } = props;
  return (
    <div
      onClick={onClick}
      className={`px-3 py-2.5 rounded-xl cursor-pointer flex items-center gap-3 transition-all ${
        isCurrent
          ? 'bg-gradient-to-r from-purple-900/60 to-indigo-900/60 border border-purple-500/40 text-white font-bold shadow-md shadow-purple-950/40'
          : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
      }`}
    >
      <div className="relative shrink-0">
        <img
          src={`https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`}
          alt="Avatar"
          className="w-7 h-7 rounded-full border border-gray-800 bg-gray-900 object-cover"
        />
        <span
          className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border-2 border-[#090d1a] ${
            isOnline ? 'bg-emerald-400' : 'bg-gray-600'
          }`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold truncate block">{user.username}</span>
        <p className="text-[10px] text-gray-500 truncate">
          {isOnline ? 'Online • Ready to chat' : 'Offline'}
        </p>
      </div>
    </div>
  );
}
