import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/components/auth/login-form';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }) }));

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['school-secret'], { secret: true });
  render(<QueryClientProvider client={queryClient}><LoginForm /></QueryClientProvider>);
  return queryClient;
}

describe('login UX', () => {
  beforeEach(() => {
    mocks.signInWithPassword.mockReset();
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('validates required fields without contacting Supabase', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with email/password, clears cached tenant data, and enters bootstrap', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    const queryClient = renderLogin();
    await userEvent.type(screen.getByLabelText('Email address'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'));
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'admin@example.com', password: 'correct horse' });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('shows a controlled credential error without exposing provider text', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { status: 400, message: 'provider internals' } });
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email address'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('email or password is incorrect');
    expect(screen.queryByText('provider internals')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveFocus();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('maps a transient provider failure to safe retryable copy', async () => {
    mocks.signInWithPassword.mockRejectedValue(new Error('network socket details'));
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email address'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in is unavailable');
    expect(screen.queryByText('network socket details')).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
