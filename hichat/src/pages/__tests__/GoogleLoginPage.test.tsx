import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import GoogleLoginPage from '../GoogleLoginPage';

vi.mock('../../hooks/useSignalKeys', () => ({
  useSignalKeys: () => ({
    loadOrGenerateKeys: vi.fn().mockResolvedValue({
      publicKeyJwk: { crv: 'P-256' },
      store: {},
    }),
  }),
}));

describe('GoogleLoginPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Google sign-in UI with preset enterprise accounts', () => {
    render(
      <BrowserRouter>
        <GoogleLoginPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
    expect(screen.getByText('Alex Chen')).toBeInTheDocument();
    expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    expect(screen.getByText('Marcus Vance')).toBeInTheDocument();
  });

  it('switches to custom Google account mode and back', () => {
    render(
      <BrowserRouter>
        <GoogleLoginPage />
      </BrowserRouter>
    );

    const useAnotherBtn = screen.getByRole('button', { name: /Use another Google account/i });
    fireEvent.click(useAnotherBtn);

    expect(screen.getByText('Enter Google Account Details')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Jordan Miller')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('jordan.miller@gmail.com')).toBeInTheDocument();

    const backBtn = screen.getByRole('button', { name: /Back to accounts/i });
    fireEvent.click(backBtn);

    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
  });
});
