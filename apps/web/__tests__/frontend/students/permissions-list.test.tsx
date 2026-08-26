import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentsWorkspace } from '@/components/students/students-workspace';
import { page, renderStudents, student } from './test-helpers';

const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search), usePathname: () => '/students', useRouter: () => ({ replace: navigation.replace }) }));
afterEach(() => { vi.restoreAllMocks(); navigation.search = ''; navigation.replace.mockReset(); });

describe('Students workspace permissions and list', () => {
  it('shows SchoolAdmin management and identity-only rows without placement requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([student])));
    renderStudents(<StudentsWorkspace />);
    expect(await screen.findByText('Bennani')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Student' })).toBeInTheDocument();
    expect(screen.queryByText(/Current Class/i)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v1/students?page=1&pageSize=20');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('/enrollments/current');
  });

  it('trusts the backend-scoped Teacher response and removes every mutation control', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([student])));
    renderStudents(<StudentsWorkspace />, 'TEACHER');
    expect(await screen.findByText('Amina')).toBeInTheDocument();
    expect(screen.getByText('Read-only access')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Student' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Amina/ })).not.toBeInTheDocument();
  });

  it('denies Parent before any Student request', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    renderStudents(<StudentsWorkspace />, 'PARENT');
    expect(screen.getByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses backend search/status filters and pagination metadata', async () => {
    navigation.search = 'page=2&status=ACTIVE&search=Amina';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([student], 2, 20, 45)));
    renderStudents(<StudentsWorkspace />);
    expect(await screen.findByText('Page 2 / 3 · 45')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=ACTIVE');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('search=Amina');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/students?page=3&status=ACTIVE&search=Amina', { scroll: false }));
  });

  it('renders the shared empty state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([])));
    renderStudents(<StudentsWorkspace />);
    expect(await screen.findByText('No records yet')).toBeInTheDocument();
  });
});
