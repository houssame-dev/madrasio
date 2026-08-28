import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogoutButton } from '@/components/auth/logout-button';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function renderLogout() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  queryClient.setQueryData(['school-secret'], { secret: true });
  render(<QueryClientProvider client={queryClient}><LogoutButton /></QueryClientProvider>);
  return queryClient;
}

describe('logout UX', () => {
  beforeEach(() => {
    router.replace.mockReset();
    router.refresh.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('waits for server success, clears all cache, and navigates to login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { signedOut: true } }));
    const queryClient = renderLogout();
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/auth/logout', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }));
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('keeps the current screen and cache when server logout fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'INTERNAL_ERROR', message: 'internal' } }, { status: 500 }));
    const queryClient = renderLogout();
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('could not log you out');
    expect(queryClient.getQueryData(['school-secret'])).toEqual({ secret: true });
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('disables repeated logout while the canonical request is pending', async () => {
    let resolveRequest!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    renderLogout();
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    const pending = screen.getByRole('button', { name: 'Logging out…' });
    expect(pending).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Logging out');
    resolveRequest(Response.json({ data: { signedOut: true } }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});
