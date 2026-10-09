import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthenticatedError } from '@/lib/errors';
const mocks = vi.hoisted(() => ({ session: vi.fn(), guard: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/auth/server-auth', () => ({ getAuthenticatedUserId: mocks.session }));
vi.mock('@/lib/authorization/server/platform', () => ({ requirePlatformAuthority: mocks.guard }));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/components/auth/logout-button', () => ({
  LogoutButton: () => <button>Log out</button>,
}));
import PlatformLayout from '@/app/platform/layout';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue('session-user');
  mocks.guard.mockResolvedValue({ userId: 'session-user' });
  mocks.redirect.mockImplementation(() => {
    throw new Error('redirect');
  });
});
it('server-protects platform children without any School context', async () => {
  render(await PlatformLayout({ children: <p>Platform content</p> }));
  expect(mocks.guard).toHaveBeenCalledWith({}, 'session-user');
  expect(screen.getByText('Platform content')).toBeInTheDocument();
});
it('does not render children after platform denial', async () => {
  mocks.guard.mockRejectedValue(new ForbiddenError());
  render(await PlatformLayout({ children: <p>Platform content</p> }));
  expect(screen.queryByText('Platform content')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument();
});
it('redirects unauthenticated users to login', async () => {
  mocks.session.mockRejectedValue(new UnauthenticatedError());
  await expect(PlatformLayout({ children: null })).rejects.toThrow('redirect');
  expect(mocks.redirect).toHaveBeenCalledWith('/login');
});
