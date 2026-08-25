import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SchoolSelectionPanel } from '@/components/app/school-selector';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const schoolA = '00000000-0000-4000-8000-000000000001';
const schoolB = '00000000-0000-4000-8000-000000000002';
const memberships = [
  { schoolId: schoolA, schoolName: 'Atlas School', role: 'SCHOOL_ADMIN' as const, status: 'ACTIVE' as const },
  { schoolId: schoolB, schoolName: 'Rif School', role: 'TEACHER' as const, status: 'ACTIVE' as const },
];

afterEach(() => { vi.restoreAllMocks(); router.replace.mockReset(); router.refresh.mockReset(); });

describe('current School switch tenant safety', () => {
  it('posts a listed School, clears School A data, refetches /me, and navigates neutral', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['students', schoolA], [{ id: 'school-a-student' }]);
    const switched = { user: { id: 'user' }, currentSchool: { id: schoolB, role: 'TEACHER' as const }, memberships };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ data: switched }))
      .mockResolvedValueOnce(Response.json({ data: switched }));

    render(<QueryClientProvider client={queryClient}><SchoolSelectionPanel memberships={memberships} /></QueryClientProvider>);
    await userEvent.click(screen.getByRole('button', { name: /Rif School/ }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/me/current-school', expect.objectContaining({ method: 'POST', body: JSON.stringify({ schoolId: schoolB }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/me', expect.anything());
    expect(queryClient.getQueryData(['students', schoolA])).toBeUndefined();
    expect(queryClient.getQueryData(['me'])).toMatchObject({ currentSchool: { id: schoolB } });
  });

  it('preserves the previous cache and context when switching fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['students', schoolA], [{ id: 'school-a-student' }]);
    queryClient.setQueryData(['me'], { currentSchool: { id: schoolA } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'FORBIDDEN', featureCode: 'INVALID_SCHOOL_CONTEXT', message: 'School is unavailable.' } }, { status: 403 }));

    render(<QueryClientProvider client={queryClient}><SchoolSelectionPanel memberships={memberships} /></QueryClientProvider>);
    await userEvent.click(screen.getByRole('button', { name: /Rif School/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('School is unavailable.');
    expect(queryClient.getQueryData(['students', schoolA])).toEqual([{ id: 'school-a-student' }]);
    expect(queryClient.getQueryData(['me'])).toMatchObject({ currentSchool: { id: schoolA } });
    expect(router.replace).not.toHaveBeenCalled();
  });
});
