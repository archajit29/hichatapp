import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageInput } from '../MessageInput';

describe('MessageInput Component', () => {
  const defaultProps = {
    input: '',
    onInputChange: vi.fn(),
    onSubmit: vi.fn((e) => e.preventDefault()),
    replyingTo: null,
    onCancelReply: vi.fn(),
    selectedFile: null,
    onRemoveFile: vi.fn(),
    onFileSelect: vi.fn(),
    isRecording: false,
    recordingDuration: 0,
    onStartRecording: vi.fn(),
    onStopRecording: vi.fn(),
    onCancelRecording: vi.fn(),
    placeholder: 'Message #general...',
  };

  it('renders text input and controls in idle state', () => {
    render(<MessageInput {...defaultProps} />);

    expect(screen.getByPlaceholderText('Message #general...')).toBeInTheDocument();
    expect(screen.getByTitle('Attach file or media')).toBeInTheDocument();
    expect(screen.getByTitle('Record Voice Note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send/i })).toBeInTheDocument();
  });

  it('handles input text typing and submit trigger', () => {
    const handleInputChange = vi.fn();
    const handleSubmit = vi.fn((e) => e.preventDefault());

    render(
      <MessageInput
        {...defaultProps}
        input="Hello World"
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
      />
    );

    const inputField = screen.getByPlaceholderText('Message #general...');
    fireEvent.change(inputField, { target: { value: 'Hello World!' } });
    expect(handleInputChange).toHaveBeenCalled();

    const sendBtn = screen.getByRole('button', { name: /Send/i });
    fireEvent.click(sendBtn);
    expect(handleSubmit).toHaveBeenCalled();
  });

  it('renders reply quote banner when replyingTo is provided', () => {
    const handleCancelReply = vi.fn();
    const mockReplying = {
      id: 'm1',
      author: 'alice',
      message: 'Original message text here',
      createdAt: new Date(),
    };

    render(
      <MessageInput
        {...defaultProps}
        replyingTo={mockReplying}
        onCancelReply={handleCancelReply}
      />
    );

    expect(screen.getByText(/Replying to/i)).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(cancelBtn);
    expect(handleCancelReply).toHaveBeenCalled();
  });

  it('renders voice recording dock when isRecording is true', () => {
    const handleStop = vi.fn();
    const handleCancel = vi.fn();

    render(
      <MessageInput
        {...defaultProps}
        isRecording={true}
        recordingDuration={65}
        onStopRecording={handleStop}
        onCancelRecording={handleCancel}
      />
    );

    expect(screen.getByText(/Recording Voice Note: 1:05/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Done & Send/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Done & Send/i }));
    expect(handleStop).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(handleCancel).toHaveBeenCalled();
  });
});
