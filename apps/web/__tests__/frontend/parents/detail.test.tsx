import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParentDetailWorkspace } from '@/components/parents/parent-detail';
import type { ParentDto } from '@/lib/frontend/parents/types';
import { page, parent, relationship, renderParents, student } from './test-helpers';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => `/parents/${parent.id}`, useRouter: () => ({ replace: navigation.replace }) }));
afterEach(() => { vi.restoreAllMocks(); navigation.replace.mockReset(); });

function detailFetch(value: ParentDto = parent) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === `/api/v1/parents/${parent.id}`) return Response.json({ data: value });
    if (url.includes('/students/') && !url.includes(`/parents/${parent.id}`)) return Response.json({ data: student });
    if (url.includes(`/parents/${parent.id}/students`)) return Response.json(page([relationship], 1, url.includes('pageSize=100') ? 100 : 20));
    return Response.json(page([]));
  });
}

describe('Parent administrator detail', () => {
  it('renders profile, neutral linked state, and relationship identity independently', async () => {
    detailFetch(); renderParents(<ParentDetailWorkspace parentId={parent.id} />);
    expect(await screen.findByRole('heading', { name: 'Samira Alaoui' })).toBeInTheDocument();
    expect(screen.getByText('Linked to an existing school User')).toBeInTheDocument(); expect(screen.queryByText(parent.userId)).not.toBeInTheDocument();
    expect(await screen.findByText('Nora Alaoui')).toBeInTheDocument(); expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(1);
  });
  it('hides link action for INACTIVE Parent without changing ACTIVE relationship status', async () => {
    detailFetch({ ...parent, status: 'INACTIVE' }); renderParents(<ParentDetailWorkspace parentId={parent.id} />);
    expect(await screen.findByText(/Inactive Parent profiles cannot access linked children/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link Student' })).not.toBeInTheDocument(); expect(await screen.findByText('Nora Alaoui')).toBeInTheDocument(); expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });
  it('provisions an unlinked Parent through the separate email action', async () => {
    const fetchMock = detailFetch({ ...parent, userId: null });
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === `/api/v1/parents/${parent.id}`) return Response.json({ data: { ...parent, userId: null } });
      if (url.endsWith('/invite-account')) return Response.json({ data: { profileId: parent.id, userId: crypto.randomUUID(), state: 'INVITED' } });
      if (url.includes(`/parents/${parent.id}/students`)) return Response.json(page([relationship]));
      return Response.json(page([]));
    });
    renderParents(<ParentDetailWorkspace parentId={parent.id} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Invite account' }));
    await userEvent.type(screen.getByLabelText('Email'), 'new.parent@example.com');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Invite account' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/invite-account'))).toBe(true));
    const call = fetchMock.mock.calls.find((entry) => String(entry[0]).endsWith('/invite-account'))!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ email: 'new.parent@example.com' });
  });
  it('maps foreign Parent detail to a controlled unavailable state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { code: 'NOT_FOUND', featureCode: 'PARENT_NOT_FOUND', message: 'foreign parent detail' } }, { status: 404 })); renderParents(<ParentDetailWorkspace parentId={parent.id} />);
    expect(await screen.findByRole('heading', { name: 'Parent unavailable' })).toBeInTheDocument(); expect(screen.queryByText(/foreign parent detail/)).not.toBeInTheDocument();
  });
});
