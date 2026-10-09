import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  PlatformSchools,
  PlatformSchool,
  CreateSchoolForm,
  AddAdminForm,
} from '@/components/platform/workspace';
import { NavigationLinks } from '@/components/app/navigation-links';
import { platformApi } from '@/lib/frontend/platform';
import { ApiClientError } from '@/lib/frontend/api-client';
vi.mock('next/navigation', () => ({ usePathname: () => '/platform/schools' }));
vi.mock('@/lib/frontend/platform', async (original) => ({
  ...(await original<object>()),
  platformApi: {
    list: vi.fn(),
    school: vi.fn(),
    admins: vi.fn(),
    create: vi.fn(),
    invite: vi.fn(),
    status: vi.fn(),
  },
}));
const school = {
  id: '05800000-0000-4000-8000-000000000001',
  name: 'Synthetic School',
  status: 'ACTIVE' as const,
  timezone: 'UTC',
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(platformApi.list).mockResolvedValue({ data: [school], meta: { total: 1 } });
  vi.mocked(platformApi.school).mockResolvedValue(school);
  vi.mocked(platformApi.admins).mockResolvedValue([
    {
      id: 'first',
      userId: 'user-a',
      email: 'first@example.test',
      status: 'ACTIVE',
      userStatus: 'ACTIVE',
    },
    {
      id: 'second',
      userId: 'user-b',
      email: 'second@example.test',
      status: 'INACTIVE',
      userStatus: 'ACTIVE',
    },
  ]);
  vi.mocked(platformApi.create).mockResolvedValue(school);
  vi.mocked(platformApi.invite).mockResolvedValue({ state: 'INVITED' });
  vi.mocked(platformApi.status).mockResolvedValue({});
});
function wrap(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
it.each(['SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'SUPER_ADMIN'] as const)(
  'does not show platform navigation from School role %s alone',
  (role) => {
    wrap(<NavigationLinks role={role} />);
    expect(screen.queryByRole('link', { name: 'Platform Schools' })).not.toBeInTheDocument();
  },
);
it('shows explicit platform navigation', () => {
  wrap(<NavigationLinks role="PARENT" platformAuthority="SUPER_ADMIN" />);
  expect(screen.getByRole('link', { name: 'Platform Schools' })).toHaveAttribute(
    'href',
    '/platform/schools',
  );
});
it('lists Schools and provides management links/wide container', async () => {
  const view = wrap(<PlatformSchools />);
  expect(await screen.findByRole('link', { name: school.name })).toHaveAttribute(
    'href',
    `/platform/schools/${school.id}`,
  );
  expect(view.container.querySelector('.max-w-\\[110rem\\]')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Create School' })).toBeInTheDocument();
});
it('validates accessible School form and focuses invalid field', async () => {
  wrap(<CreateSchoolForm onCancel={vi.fn()} onSaved={async () => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Create School' }));
  await waitFor(() =>
    expect(screen.getByLabelText(/School name/)).toHaveAttribute('aria-invalid', 'true'),
  );
  expect(screen.getByLabelText(/School name/)).toHaveFocus();
  expect(platformApi.create).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText(/School name/), 'New');
  await userEvent.click(screen.getByRole('button', { name: 'Create School' }));
  await waitFor(() =>
    expect(platformApi.create).toHaveBeenCalledWith(
      { name: 'New', timezone: 'UTC' },
      expect.anything(),
    ),
  );
});
it('adds an Admin by email only, with no password/role/UUID fields and success feedback', async () => {
  wrap(<AddAdminForm schoolId={school.id} />);
  expect(screen.queryByLabelText(/password|role|user id/i)).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/Admin email/), 'new@example.test');
  await userEvent.keyboard('{Enter}');
  expect(await screen.findByRole('status')).toHaveTextContent('Invitation initiated.');
  expect(platformApi.invite).toHaveBeenCalledWith(school.id, { email: 'new@example.test' });
});
it('prevents duplicate invitation submission while pending', async () => {
  let done!: (value: { state: 'INVITED' }) => void;
  vi.mocked(platformApi.invite).mockReturnValue(
    new Promise((resolve) => {
      done = resolve;
    }),
  );
  wrap(<AddAdminForm schoolId={school.id} />);
  await userEvent.type(screen.getByLabelText(/Admin email/), 'new@example.test');
  await userEvent.dblClick(screen.getByRole('button', { name: 'Invite or link Admin' }));
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  expect(platformApi.invite).toHaveBeenCalledOnce();
  await act(async () => done({ state: 'INVITED' }));
});
it('lists multiple Admins and dispatches scoped deactivate/reactivate with feedback', async () => {
  wrap(<PlatformSchool schoolId={school.id} />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Deactivate first@example.test' }),
  );
  await waitFor(() =>
    expect(platformApi.status).toHaveBeenCalledWith(school.id, 'first', 'INACTIVE'),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Reactivate second@example.test' }));
  await waitFor(() =>
    expect(platformApi.status).toHaveBeenCalledWith(school.id, 'second', 'ACTIVE'),
  );
  expect(await screen.findAllByText('Membership updated.')).toHaveLength(2);
});
it('maps errors without displaying provider internals', async () => {
  vi.mocked(platformApi.invite).mockRejectedValue(new Error('private-provider-secret'));
  wrap(<AddAdminForm schoolId={school.id} />);
  await userEvent.type(screen.getByLabelText(/Admin email/), 'new@example.test');
  await userEvent.click(screen.getByRole('button', { name: 'Invite or link Admin' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The action could not be completed');
  expect(screen.queryByText(/private-provider-secret/)).not.toBeInTheDocument();
});
it('denies workspace rendering after authoritative 403', async () => {
  vi.mocked(platformApi.list).mockRejectedValue(
    new ApiClientError(403, { code: 'FORBIDDEN', message: 'Denied' }),
  );
  wrap(<PlatformSchools />);
  expect(await screen.findByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create School' })).not.toBeInTheDocument();
});
