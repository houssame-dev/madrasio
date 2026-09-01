import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SetPasswordForm } from '@/components/auth/set-password-form';

const mocks = vi.hoisted(() => ({ updateUser: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock('@/lib/supabase/browser', () => ({
  getBrowserSupabase: () => ({ auth: { updateUser: mocks.updateUser } }),
}));

function renderForm() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['tenant-data'], { private: true });
  render(<QueryClientProvider client={queryClient}><SetPasswordForm /></QueryClientProvider>);
  return queryClient;
}

describe('invite password setup', () => {
  beforeEach(() => {
    mocks.updateUser.mockReset(); mocks.replace.mockReset(); mocks.refresh.mockReset();
  });

  it('requires matching suitable passwords without contacting Auth', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('New password'), 'short');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'different');
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText('Passwords must match.')).toBeInTheDocument();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('updates the authenticated invite session, clears cache, and enters app bootstrap', async () => {
    mocks.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    const queryClient = renderForm();
    await userEvent.type(screen.getByLabelText('New password'), 'strong-pass-123');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'strong-pass-123');
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'));
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'strong-pass-123' });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('maps Auth failure without exposing provider details', async () => {
    mocks.updateUser.mockResolvedValue({ data: { user: null }, error: new Error('provider internals') });
    renderForm();
    await userEvent.type(screen.getByLabelText('New password'), 'strong-pass-123');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'strong-pass-123');
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be set/);
    expect(screen.queryByText(/provider internals/)).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

