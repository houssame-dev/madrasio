import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { RecoveryForm } from '@/components/auth/recovery-form';
import { AccountRecoveryAction } from '@/components/auth/account-recovery-action';
import { recoveryCopy as t } from '@/lib/frontend/auth/recovery-copy';
import { ApiClientError } from '@/lib/frontend/api-client';
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/frontend/api-client', async (original) => ({
  ...(await original<object>()),
  apiRequest: mocks.request,
}));
beforeEach(() => {
  mocks.request.mockReset().mockResolvedValue({ data: { state: 'REQUESTED' } });
});
it('associates public email errors and focuses the first invalid field', async () => {
  render(<RecoveryForm />);
  const input = screen.getByLabelText(/Email address/);
  expect(input).toHaveAttribute('aria-required', 'true');
  await userEvent.click(screen.getByRole('button', { name: t.submit }));
  await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
  expect(input).toHaveAccessibleDescription(/email/i);
  expect(input).toHaveFocus();
  expect(mocks.request).not.toHaveBeenCalled();
});
it('supports keyboard submission with persistent generic instructions', async () => {
  render(<RecoveryForm />);
  await userEvent.type(screen.getByLabelText(/Email address/), 'user@example.test');
  await userEvent.keyboard('{Enter}');
  expect(await screen.findByRole('status')).toHaveTextContent(t.confirmation);
  expect(screen.queryByRole('button', { name: t.submit })).not.toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledWith('/api/v1/auth/recovery', {
    method: 'POST',
    body: JSON.stringify({ email: 'user@example.test' }),
  });
  expect(mocks.request).toHaveBeenCalledOnce();
});
it('blocks duplicate public button submission while pending', async () => {
  let done!: () => void;
  mocks.request.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        done = resolve;
      }),
  );
  render(<RecoveryForm />);
  await userEvent.type(screen.getByLabelText(/Email address/), 'user@example.test');
  await userEvent.dblClick(screen.getByRole('button', { name: t.submit }));
  expect(screen.getByRole('button', { name: t.pending })).toBeDisabled();
  expect(mocks.request).toHaveBeenCalledOnce();
  await act(async () => done());
});
it('sanitizes public transport failure and restores focus', async () => {
  mocks.request.mockRejectedValue(new Error('private-detail'));
  render(<RecoveryForm />);
  await userEvent.type(screen.getByLabelText(/Email address/), 'user@example.test');
  await userEvent.click(screen.getByRole('button', { name: t.submit }));
  expect(await screen.findByRole('alert')).toHaveTextContent(t.unavailable);
  expect(screen.queryByText(/private-detail/)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Email address/)).toHaveFocus();
});
it.each(['teachers', 'parents'] as const)(
  'sends only the %s profile action, disables repeat clicks and keeps next steps visible',
  async (kind) => {
    render(<AccountRecoveryAction kind={kind} profileId="profile-id" />);
    await userEvent.dblClick(screen.getByRole('button', { name: t.assist }));
    expect(await screen.findByRole('status')).toHaveTextContent(t.assistSuccess);
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledWith(`/api/v1/${kind}/profile-id/recover-account`, {
      method: 'POST',
      body: '{}',
    });
    expect(screen.getByRole('button', { name: t.assist })).toBeDisabled();
  },
);
it('maps administrator cooldown safely', async () => {
  mocks.request.mockRejectedValue(
    new ApiClientError(429, {
      code: 'RATE_LIMITED',
      featureCode: 'ACCOUNT_RECOVERY_COOLDOWN',
      message: 'private-detail',
    }),
  );
  render(<AccountRecoveryAction kind="parents" profileId="profile-id" />);
  await userEvent.click(screen.getByRole('button', { name: t.assist }));
  expect(await screen.findByRole('alert')).toHaveTextContent(t.cooldown);
  expect(screen.queryByText(/private-detail/)).not.toBeInTheDocument();
});
