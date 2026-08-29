import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageList } from '../MessageList';

describe('MessageList Component', () => {
  const defaultProps = {
    messages: [],
    currentUsername: 'alice',
    pinnedMessages: [],
    showPinnedBanner: false,
    onClosePinnedBanner: vi.fn(),
    copiedMessageId: null,
    activeReactionPickerId: null,
    messagesEndRef: { current: null },
    onReply: vi.fn(),
    onTogglePin: vi.fn(),
    onCopyCiphertext: vi.fn(),
    onDelete: vi.fn(),
    onAddReaction: vi.fn(),
    onToggleReactionPicker: vi.fn(),
    onOpenLightbox: vi.fn(),
    onQuickMessage: vi.fn(),
  };

  it('renders EmptyChatState when messages list is empty', () => {
    render(<MessageList {...defaultProps} messages={[]} />);

    expect(screen.getByText('Encrypted Session Ready')).toBeInTheDocument();
    expect(
      screen.getByText(/Messages in this channel are encrypted client-side/i)
    ).toBeInTheDocument();
  });

  it('renders message bubbles when messages exist', () => {
    const mockMessages = [
      { id: 'm1', author: 'alice', message: 'Hello from Alice', time: '10:00 AM' },
      { id: 'm2', author: 'bob', message: 'Hey from Bob', time: '10:01 AM' },
    ];

    render(<MessageList {...defaultProps} messages={mockMessages as any} />);

    expect(screen.getByText('Hello from Alice')).toBeInTheDocument();
    expect(screen.getByText('Hey from Bob')).toBeInTheDocument();
  });

  it('renders pinned messages banner when showPinnedBanner is true and pinned messages exist', () => {
    const mockPinned = [
      { id: 'm1', author: 'alice', message: 'Important secret announcement' },
    ];
    const handleCloseBanner = vi.fn();

    render(
      <MessageList
        {...defaultProps}
        messages={mockPinned as any}
        pinnedMessages={mockPinned as any}
        showPinnedBanner={true}
        onClosePinnedBanner={handleCloseBanner}
      />
    );

    expect(screen.getByText('Pinned:')).toBeInTheDocument();
    expect(screen.getByText('"Important secret announcement"')).toBeInTheDocument();
  });
});
