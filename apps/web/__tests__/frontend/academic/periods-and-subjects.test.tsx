import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubjectsSection } from '@/components/academic/subjects-section';
import { YearsSection } from '@/components/academic/years-section';
import type { AcademicPeriodDto } from '@/lib/frontend/academic/types';
import { page, renderAcademic, subjectId, timestamps, yearId } from './test-helpers';

const periodId = '00000000-0000-4000-8000-000000000011';
const year = { id: yearId, name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'PLANNED' as const, ...timestamps };
const plannedPeriod: AcademicPeriodDto = { id: periodId, academicYearId: yearId, name: 'Term 1', sequence: 1, startDate: '2026-09-01', endDate: '2026-12-20', status: 'PLANNED', ...timestamps };

afterEach(() => vi.restoreAllMocks());

function periodsFetch(period = plannedPeriod) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === 'POST') return Response.json({ data: period });
    if (init?.method === 'PATCH') return Response.json({ data: period });
    if (url.includes('/periods')) return Response.json(page([period]));
    return Response.json(page([year]));
  });
}

describe('Academic Period UI', () => {
  it('loads Periods only after selecting their exact Year', async () => {
    const fetchMock = periodsFetch();
    renderAcademic(<YearsSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    await screen.findByText('2026/2027');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/periods'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Manage periods' }));
    expect(await screen.findByText('Term 1')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes(`/academic-years/${yearId}/periods`))).toBe(true);
  });

  it('creates inside Year context and rejects an obvious outside-Year range before POST', async () => {
    const fetchMock = periodsFetch();
    renderAcademic(<YearsSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Manage periods' }));
    await screen.findByText('Term 1');
    await userEvent.click(screen.getByRole('button', { name: 'Create academic period' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Term 2');
    expect(screen.getByLabelText('Start date')).toHaveAttribute('min', year.startDate);
    expect(screen.getByLabelText('End date')).toHaveAttribute('max', year.endDate);
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-07-01' } });
    fireEvent.submit(screen.getByLabelText('End date').closest('form')!);
    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === 'POST')).toHaveLength(0));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2027-01-05' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-03-31' } });
    fireEvent.submit(screen.getByLabelText('End date').closest('form')!);
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'POST')).toBe(true));
    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'POST');
    expect(String(post?.[0])).toContain(`/academic-years/${yearId}/periods`);
    expect((post?.[1] as RequestInit).body).toContain('"sequence":0');
  });

  it('makes ACTIVE Period dates read-only and maps the immutable feature error', async () => {
    const active = { ...plannedPeriod, status: 'ACTIVE' as const };
    const fetchMock = periodsFetch(active);
    const view = renderAcademic(<YearsSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Manage periods' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Term 1' }));
    expect(screen.getByLabelText('Start date')).toHaveAttribute('readonly');
    view.unmount(); fetchMock.mockRestore();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'PATCH') return Response.json({ error: { code: 'BUSINESS_RULE_VIOLATION', featureCode: 'ACADEMIC_PERIOD_DATES_IMMUTABLE', message: 'raw' } }, { status: 400 });
      return Response.json(String(input).includes('/periods') ? page([plannedPeriod]) : page([year]));
    });
    renderAcademic(<YearsSection schoolId="school" canManage page={1} onPage={vi.fn()} onStatus={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Manage periods' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Term 1' }));
    await userEvent.clear(screen.getByLabelText('End date')); await userEvent.type(screen.getByLabelText('End date'), '2026-12-21');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/period dates can no longer/i);
  });
});

describe('Subjects UI', () => {
  it('renders name, optional code, and lifecycle status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([{ id: subjectId, name: 'Mathematics', code: null, status: 'INACTIVE', ...timestamps }])));
    renderAcademic(<SubjectsSection schoolId="school" canManage={false} page={1} onPage={vi.fn()} onStatus={vi.fn()} onSearch={vi.fn()} />);
    expect(await screen.findByText('Mathematics')).toBeInTheDocument();
    expect(screen.getAllByText('INACTIVE').length).toBeGreaterThan(0);
    expect(screen.queryByText(/coefficient/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create subject' })).not.toBeInTheDocument();
  });

  it('sends search/status filters to the backend and uses pagination meta', async () => {
    const onSearch = vi.fn(); const onStatus = vi.fn(); const onPage = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page([], 2, 20, 45)));
    renderAcademic(<SubjectsSection schoolId="school" canManage page={2} status="ACTIVE" search="math" onPage={onPage} onStatus={onStatus} onSearch={onSearch} />);
    expect(await screen.findByText('Page 2 / 3 · 45')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('page=2');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('status=ACTIVE');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('search=math');
    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'INACTIVE');
    expect(onStatus).toHaveBeenCalledWith('INACTIVE');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(3);
  });
});
