import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

function ProblematicComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Crashing child component render');
  }
  return <div>Healthy Child Content</div>;
}

describe('ErrorBoundary Component', () => {
  beforeEach(() => {
    // Suppress console.error in test runner when throwing inside component
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <ProblematicComponent shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Healthy Child Content')).toBeInTheDocument();
  });

  it('catches render error and displays Vault Render Protection fallback UI', () => {
    render(
      <ErrorBoundary>
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Vault Render Protection')).toBeInTheDocument();
    expect(screen.getByText('Crashing child component render')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload Vault/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Return Home/i })).toBeInTheDocument();
  });

  it('renders custom fallback if provided in props', () => {
    render(
      <ErrorBoundary fallback={<div>Custom Isolated Error Message</div>}>
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Isolated Error Message')).toBeInTheDocument();
    expect(screen.queryByText('Vault Render Protection')).not.toBeInTheDocument();
  });
});
