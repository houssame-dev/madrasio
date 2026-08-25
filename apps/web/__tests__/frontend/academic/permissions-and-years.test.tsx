import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcademicWorkspace } from '@/components/academic/academic-workspace';
import { YearsSection } from '@/components/academic/years-section';
import { visibleNavigationItems } from '@/lib/frontend/navigation';
import { page, renderAcademic, timestamps, yearId } from './test-helpers';

const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search), usePathname: () => '/academic', useRouter: () => ({ replace: navigation.replace }) }));

const plannedYear = { id: yearId, name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'PLANNED' as const, ...timestamps };

afterEach(() => { vi.restoreAllMocks(); navigation.search = ''; navigation.replace.mockReset(); });

function yearFetch(data = [plannedYear]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('/api/v1/academic-years') && (!init?.method || init.method === 'GET')) return Response.json(page(data));
    return Response.json({ data: plannedYear });
  });
}

describe('academic permissions and years workspace', () => {
  it('allows Teacher read-only access and navigation without mutation controls', async () => {
    yearFetch();
    renderAcademic(<AcademicWorkspace />, 'TEACHER');
    expect(await screen.findByText('2026/2027')).toBeInTheDocument();
    expect(screen.getByText('Read-only access')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create academic year' })).not.toBeInTheDocument();
    expect(visibleNavigationItems('TEACHER').map((item) => item.label)).toContain('Academic Structure');
  });

  it('prevents Parent access before any Academic Structure fetch', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    renderAcademic(<AcademicWorkspace />, 'PARENT');
    expect(screen.getByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows management actions to SchoolAdmin and renders API/empty list states', async () => {
    const fetchMock = yearFetch();
    const view = renderAcademic(<YearsSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    expect(await screen.findByText('2026/2027')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create academic year' })).toBeInTheDocument();
    view.unmount(); fetchMock.mockRestore();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([])));
    renderAcademic(<YearsSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    expect(await screen.findByText('No records yet')).toBeInTheDocument();
  });

  it('creates a Year with the exact payload and blocks invalid date order client-side', async () => {
    const fetchMock = yearFetch([]);
    renderAcademic(<YearsSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    await screen.findByText('No records yet');
    await userEvent.click(screen.getByRole('button', { name: 'Create academic year' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Invalid year');
    await userEvent.type(screen.getByLabelText('Start date'), '2027-09-01');
    await userEvent.type(screen.getByLabelText('End date'), '2027-06-30');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('End date must be after start date.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === 'POST')).toHaveLength(0);
    await userEvent.clear(screen.getByLabelText('End date'));
    await userEvent.type(screen.getByLabelText('End date'), '2028-06-30');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'POST')).toBe(true));
    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'POST');
    expect((post?.[1] as RequestInit).body).toBe(JSON.stringify({ name: 'Invalid year', startDate: '2027-09-01', endDate: '2028-06-30' }));
  });

  it('edits PLANNED dates, makes ACTIVE dates read-only, and maps immutable backend errors', async () => {
    const immutableFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'PATCH') return Response.json({ error: { code: 'BUSINESS_RULE_VIOLATION', featureCode: 'ACADEMIC_YEAR_DATES_IMMUTABLE', message: 'raw' } }, { status: 400 });
      return Response.json(page([plannedYear]));
    });
    const view = renderAcademic(<YearsSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit 2026/2027' }));
    expect(screen.getByLabelText('Start date')).not.toHaveAttribute('readonly');
    await userEvent.clear(screen.getByLabelText('Start date')); await userEvent.type(screen.getByLabelText('Start date'), '2026-08-15');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/can no longer be changed/i);
    view.unmount(); immutableFetch.mockRestore();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([{ ...plannedYear, status: 'ACTIVE' }])));
    renderAcademic(<YearsSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit 2026/2027' }));
    expect(screen.getByLabelText('Start date')).toHaveAttribute('readonly');
    expect(screen.getByText(/Dates are read-only/)).toBeInTheDocument();
  });

  it('offers only the valid Year lifecycle action and requires confirmation', async () => {
    const fetchMock = yearFetch();
    renderAcademic(<YearsSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Activate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activate' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Activate 2026/2027?');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.body === JSON.stringify({ status: 'ACTIVE' }))).toBe(true));
  });
});
