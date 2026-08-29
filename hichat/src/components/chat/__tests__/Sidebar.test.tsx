import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';

describe('Sidebar Component', () => {
  const mockAuthUser = { id: 'u1', username: 'alice', email: 'alice@example.com' };
  const mockRooms = [
    { id: 'general', name: 'General', description: 'Main chat', isPrivate: false },
    { id: 'security', name: 'Security Hub', description: 'E2EE audit', isPrivate: false },
  ];
  const mockAllUsers = [
    { id: 'u1', username: 'alice', email: 'alice@example.com' },
    { id: 'u2', username: 'bob', email: 'bob@example.com' },
  ];
  const mockActiveUsersMap = new Map([
    ['bob', { socketId: 's1', username: 'bob', status: 'online' as const, rawPublicKey: {} }],
  ]);

  const defaultProps = {
    authUser: mockAuthUser,
    userStatus: 'online' as const,
    statusDropdown: false,
    onToggleStatusDropdown: vi.fn(),
    onStatusChange: vi.fn(),
    myFingerprint: '0x1234567890ABCDEF',
    isSidebarOpen: true,
    onCloseSidebar: vi.fn(),
    soundEnabled: true,
    onToggleSound: vi.fn(),
    onLogout: vi.fn(),
    rooms: mockRooms,
    activeTab: 'channel' as const,
    activeRoom: 'general',
    unreadCounts: { security: 2 },
    onSelectChannel: vi.fn(),
    onOpenCreateRoomModal: vi.fn(),
    allUsers: mockAllUsers,
    activeDMUser: null,
    activeUsersMap: mockActiveUsersMap,
    onSelectDM: vi.fn(),
    onOpenKeyModal: vi.fn(),
  };

  it('renders auth user information and status', () => {
    render(
      <BrowserRouter>
        <Sidebar {...defaultProps} />
      </BrowserRouter>
    );

    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText(/● ONLINE/i)).toBeInTheDocument();
  });

  it('renders rooms list with unread count badges', () => {
    render(
      <BrowserRouter>
        <Sidebar {...defaultProps} />
      </BrowserRouter>
    );

    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Security Hub')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Unread count badge for security
  });

  it('triggers channel selection when a channel is clicked', () => {
    const handleSelectChannel = vi.fn();
    render(
      <BrowserRouter>
        <Sidebar {...defaultProps} onSelectChannel={handleSelectChannel} />
      </BrowserRouter>
    );

    const securityRoom = screen.getByText('Security Hub');
    fireEvent.click(securityRoom);

    expect(handleSelectChannel).toHaveBeenCalledWith('security');
  });

  it('renders other direct message users and handles DM selection', () => {
    const handleSelectDM = vi.fn();
    render(
      <BrowserRouter>
        <Sidebar {...defaultProps} onSelectDM={handleSelectDM} />
      </BrowserRouter>
    );

    const bobUser = screen.getByText('bob');
    expect(bobUser).toBeInTheDocument();

    fireEvent.click(bobUser);
    expect(handleSelectDM).toHaveBeenCalledWith(mockAllUsers[1]);
  });

  it('triggers safety fingerprint modal when footer button is clicked', () => {
    const handleOpenKeyModal = vi.fn();
    render(
      <BrowserRouter>
        <Sidebar {...defaultProps} onOpenKeyModal={handleOpenKeyModal} />
      </BrowserRouter>
    );

    const keyBtn = screen.getByRole('button', { name: /ECDH Safety Fingerprint/i });
    fireEvent.click(keyBtn);

    expect(handleOpenKeyModal).toHaveBeenCalledTimes(1);
  });
});
