import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeachersWorkspace } from '@/components/teachers/teachers-workspace';
import { page, renderTeachers, teacher } from './test-helpers';

const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search), usePathname: () => '/teachers', useRouter: () => ({ replace: navigation.replace }) }));
afterEach(() => { vi.restoreAllMocks(); navigation.search = ''; navigation.replace.mockReset(); });

describe('Teachers workspace permissions and list', () => {
  it('shows SchoolAdmin management data without per-row Assignment requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([teacher])));
    renderTeachers(<TeachersWorkspace />);
    expect(await screen.findByText('Amrani')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Teacher' })).toBeInTheDocument();
    expect(screen.getByText('Linked to an existing school User')).toBeInTheDocument();
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/teachers?page=1&pageSize=20');
  });

  it('uses the server-owned self-scoped list for Teacher and hides management', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([teacher])));
    renderTeachers(<TeachersWorkspace />, 'TEACHER');
    expect(await screen.findByRole('heading', { name: 'My Teacher profiles' })).toBeInTheDocument();
    expect(screen.getByText('Read-only access')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Teacher' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Edit Leila/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('denies Parent before any Teacher request', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); renderTeachers(<TeachersWorkspace />, 'PARENT');
    expect(screen.getByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses backend status/search filters and pagination metadata', async () => {
    navigation.search = 'page=2&status=ACTIVE&search=Leila'; const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([teacher], 2, 20, 45)));
    renderTeachers(<TeachersWorkspace />); expect(await screen.findByText('Page 2 / 3 · 45')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=ACTIVE'); expect(String(fetchMock.mock.calls[0]?.[0])).toContain('search=Leila');
    await userEvent.click(screen.getByRole('button', { name: 'Next' })); await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/teachers?page=3&status=ACTIVE&search=Leila', { scroll: false }));
  });

  it('renders the shared empty state for an empty server page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([]))); renderTeachers(<TeachersWorkspace />);
    expect(await screen.findByText('No records yet')).toBeInTheDocument();
  });
});
