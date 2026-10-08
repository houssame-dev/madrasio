import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/components/auth/set-password-form', () => ({
  SetPasswordForm: () => <div>Password form</div>,
}));
import SetPasswordPage from '@/app/auth/set-password/page';
it.each(['absent', 'expired', 'callback-error'])(
  'denies password form for %s context',
  async (state) => {
    mocks.getUser.mockResolvedValue({
      data: { user: state === 'callback-error' ? { id: 'existing' } : null },
      error: state === 'expired' ? new Error('private-detail') : null,
    });
    render(
      await SetPasswordPage({
        searchParams: Promise.resolve(
          state === 'callback-error' ? { error: 'invalid-recovery' } : {},
        ),
      }),
    );
    expect(screen.queryByText('Password form')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recover account access' })).toHaveAttribute(
      'href',
      '/auth/recover',
    );
    expect(screen.queryByText(/private-detail/)).not.toBeInTheDocument();
  },
);
it('uses the existing verified Auth session, not application membership, for password setup', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'existing' } }, error: null });
  render(await SetPasswordPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText('Password form')).toBeInTheDocument();
});
it('fails closed without exposing thrown Auth transport details', async () => {
  mocks.getUser.mockRejectedValue(new Error('private-detail'));
  render(await SetPasswordPage({ searchParams: Promise.resolve({}) }));
  expect(screen.queryByText('Password form')).not.toBeInTheDocument();
  expect(screen.queryByText(/private-detail/)).not.toBeInTheDocument();
});
