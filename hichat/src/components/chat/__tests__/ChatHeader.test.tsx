import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatHeader } from '../ChatHeader';

describe('ChatHeader Component', () => {
  const defaultProps = {
    activeTab: 'channel' as const,
    activeRoom: 'general',
    activeDMUser: null,
    activeRoomDescription: 'General discussion channel',
    searchQuery: '',
    onSearchChange: vi.fn(),
    pinnedCount: 0,
    showPinnedBanner: false,
    onTogglePinnedBanner: vi.fn(),
    onOpenSidebar: vi.fn(),
    onToggleRightDrawer: vi.fn(),
  };

  it('renders channel header with name, description, and E2EE badge', () => {
    render(<ChatHeader {...defaultProps} />);

    expect(screen.getByText('#general')).toBeInTheDocument();
    expect(screen.getByText('E2EE LIVE')).toBeInTheDocument();
    expect(screen.getByText('General discussion channel')).toBeInTheDocument();
  });

  it('renders DM header when activeTab is dm', () => {
    render(
      <ChatHeader
        {...defaultProps}
        activeTab="dm"
        activeDMUser={{ id: 'u2', username: 'bob', email: 'bob@example.com' }}
      />
    );

    expect(screen.getByText('@bob')).toBeInTheDocument();
    expect(screen.getByText(/Secure direct message channel with @bob/i)).toBeInTheDocument();
  });

  it('handles search input query changes', () => {
    const handleSearchChange = vi.fn();
    render(<ChatHeader {...defaultProps} onSearchChange={handleSearchChange} />);

    const searchInput = screen.getByPlaceholderText('Search messages...');
    fireEvent.change(searchInput, { target: { value: 'quantum' } });

    expect(handleSearchChange).toHaveBeenCalledWith('quantum');
  });

  it('shows pinned messages count button when pinnedCount > 0 and handles click', () => {
    const handleTogglePinned = vi.fn();
    render(
      <ChatHeader
        {...defaultProps}
        pinnedCount={3}
        onTogglePinnedBanner={handleTogglePinned}
      />
    );

    const pinBtn = screen.getByTitle('View Pinned Messages');
    expect(pinBtn).toBeInTheDocument();
    expect(screen.getByText('3 Pinned')).toBeInTheDocument();

    fireEvent.click(pinBtn);
    expect(handleTogglePinned).toHaveBeenCalledTimes(1);
  });

  it('triggers right drawer toggle when member inspector button is clicked', () => {
    const handleToggleRightDrawer = vi.fn();
    render(<ChatHeader {...defaultProps} onToggleRightDrawer={handleToggleRightDrawer} />);

    const memberBtn = screen.getByTitle('Chat Info & Security');
    fireEvent.click(memberBtn);

    expect(handleToggleRightDrawer).toHaveBeenCalledTimes(1);
  });
});
