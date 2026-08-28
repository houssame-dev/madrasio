import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppBootstrap } from '@/components/app/app-bootstrap';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/dashboard' }));

const schoolA = '00000000-0000-4000-8000-000000000001';
const schoolB = '00000000-0000-4000-8000-000000000002';

function renderBootstrap(fetcher: typeof fetch) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(fetcher);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AppBootstrap><h1>Protected content</h1></AppBootstrap></QueryClientProvider>);
}

afterEach(() => {
  vi.restoreAllMocks();
  router.replace.mockReset();
  router.refresh.mockReset();
});

describe('/me application bootstrap', () => {
  it('shows loading without flashing protected content', () => {
    renderBootstrap(() => new Promise(() => undefined));
    expect(screen.getByRole('status')).toHaveTextContent('Loading your workspace');
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders the responsive authenticated shell for a selected school', async () => {
    renderBootstrap(async () => Response.json({ data: { user: { id: 'user' }, currentSchool: { id: schoolA, role: 'SCHOOL_ADMIN' }, memberships: [{ schoolId: schoolA, schoolName: 'Atlas School', role: 'SCHOOL_ADMIN', status: 'ACTIVE' }] } }));
    expect(await screen.findByText('Protected content')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-navigation-trigger')).toHaveAccessibleName('Open navigation');
    expect(screen.getAllByText('Atlas School').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('shows only returned memberships when multiple schools need selection', async () => {
    renderBootstrap(async () => Response.json({ data: { user: { id: 'user' }, currentSchool: null, memberships: [{ schoolId: schoolA, schoolName: 'Atlas School', role: 'TEACHER', status: 'ACTIVE' }, { schoolId: schoolB, schoolName: 'Rif School', role: 'PARENT', status: 'ACTIVE' }] } }));
    expect(await screen.findByRole('heading', { name: 'Choose a school' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atlas School/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rif School/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('distinguishes zero memberships, inactive users, and transient failure', async () => {
    const cases = [
      [Response.json({ data: { user: { id: 'user' }, currentSchool: null, memberships: [] } }), 'No active school'],
      [Response.json({ error: { code: 'FORBIDDEN', featureCode: 'USER_INACTIVE', message: 'Inactive' } }, { status: 403 }), 'Account inactive'],
      [new Response('bad gateway', { status: 502 }), 'We could not load this page.'],
    ] as const;
    for (const [response, expected] of cases) {
      const view = renderBootstrap(async () => response.clone());
      expect(await screen.findByRole('heading', { name: expected })).toBeInTheDocument();
      if (expected !== 'We could not load this page.') expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
      view.unmount();
      vi.restoreAllMocks();
    }
  });

  it('clears all cached data and redirects an expired /me session without rendering protected content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } }, { status: 401 }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['school-secret'], { secret: true });
    render(<QueryClientProvider client={queryClient}><AppBootstrap><h1>Protected content</h1></AppBootstrap></QueryClientProvider>);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});
