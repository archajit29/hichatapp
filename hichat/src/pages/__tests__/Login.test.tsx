import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from '../Login';
import { useAuthStore } from '../../store/auth.store';

vi.mock('../../hooks/useSignalKeys', () => ({
  useSignalKeys: () => ({
    initializeAndUploadKeys: vi.fn().mockResolvedValue(undefined),
  }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Login Page', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: false,
      loading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      clearError: vi.fn(),
    });
    vi.clearAllMocks();
  });

  it('renders login form with username and password fields', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    expect(screen.getByText('Unlock Key Vault')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. alex_developer')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Authorize & Decrypt/i })).toBeInTheDocument();
  });

  it('toggles to registration mode and displays email field', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    const createVaultTab = screen.getByRole('button', { name: 'Create Vault' });
    fireEvent.click(createVaultTab);

    expect(screen.getByText('Create Security Vault')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('alex@enterprise.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Keys & Register/i })).toBeInTheDocument();
  });

  it('submits login form with entered credentials', async () => {
    const mockLogin = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ login: mockLogin });

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    const usernameInput = screen.getByPlaceholderText('e.g. alex_developer');
    const passwordInput = screen.getByPlaceholderText('••••••••••••');
    const submitBtn = screen.getByRole('button', { name: /Authorize & Decrypt/i });

    fireEvent.change(usernameInput, { target: { value: 'alice' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'alice', password: 'password123' });
    });
  });

  it('redirects to /chat if user is already authenticated', () => {
    useAuthStore.setState({ isAuthenticated: true });

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/chat');
  });
});
