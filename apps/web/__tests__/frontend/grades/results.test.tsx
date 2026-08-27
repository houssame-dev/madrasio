import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultCalculationForm } from '@/components/grades/results/result-calculation-form';
import { ResultsWorkspace } from '@/components/grades/results/results-workspace';
import { classId, gradebook, gradebookId, klass, matrix, page, period, periodId, renderGrades, resultId, schoolId, student, studentId, subject, subjectResult, year, yearId } from './test-helpers';

const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search), usePathname: () => '/grades/results', useRouter: () => ({ replace: navigation.replace }) }));
afterEach(() => { vi.restoreAllMocks(); navigation.search = ''; navigation.replace.mockReset(); });

function setupResults() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input); const method = (init as RequestInit | undefined)?.method;
    if (url === '/api/v1/results/subjects?page=1&pageSize=20') return Response.json(page([subjectResult]));
    if (url === '/api/v1/results/periods?page=1&pageSize=20') return Response.json(page([{ ...subjectResult, resultType: 'PERIOD', subjectId: null }]));
    if (url === '/api/v1/results/annual?page=1&pageSize=20') return Response.json(page([{ ...subjectResult, resultType: 'ANNUAL', subjectId: null, academicPeriodId: null }]));
    if (url === `/api/v1/results/${resultId}?resultType=SUBJECT`) return Response.json({ data: subjectResult });
    if (url === '/api/v1/academic-years?page=1&pageSize=100') return Response.json(page([year], 1, 100));
    if (url === '/api/v1/classes?page=1&pageSize=100') return Response.json(page([klass], 1, 100));
    if (url === '/api/v1/subjects?page=1&pageSize=100') return Response.json(page([subject], 1, 100));
    if (url === '/api/v1/students?page=1&pageSize=100') return Response.json(page([student], 1, 100));
    if (url === '/api/v1/gradebooks?page=1&pageSize=100') return Response.json(page([{ ...gradebook, status: 'OPEN' }], 1, 100));
    if (url === `/api/v1/academic-years/${yearId}/periods?page=1&pageSize=100`) return Response.json(page([period], 1, 100));
    if (url === `/api/v1/gradebooks/${gradebookId}/grades?page=1&pageSize=100`) return Response.json(matrix);
    if (url === '/api/v1/results/subjects/calculate' && method === 'POST') return Response.json({ data: subjectResult }, { status: 201 });
    if (url === '/api/v1/results/periods/calculate' && method === 'POST') return Response.json({ data: { ...subjectResult, resultType: 'PERIOD', subjectId: null } }, { status: 201 });
    if (url === '/api/v1/results/annual/calculate' && method === 'POST') return Response.json({ data: { ...subjectResult, resultType: 'ANNUAL', subjectId: null, academicPeriodId: null } }, { status: 201 });
    if (url === `/api/v1/students?academicYearId=${yearId}&classId=${classId}&page=1&pageSize=100`) return Response.json(page([student], 1, 100));
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe('Results workspace roles and separation', () => {
  it('renders a SubjectResult with exact human context and no frontend average', async () => {
    setupResults(); renderGrades(<ResultsWorkspace />);
    expect(await screen.findByText('12.25')).toBeInTheDocument();
    expect(screen.getByText('Sara Amrani (S-001)')).toBeInTheDocument();
    expect(screen.getByText(/2026\/2027.*1A.*Mathematics/)).toBeInTheDocument();
    expect(screen.queryByText(/average|ranking/i)).not.toBeInTheDocument();
  });

  it('keeps Period and Annual as separate server resources for administrators', async () => {
    setupResults(); renderGrades(<ResultsWorkspace />);
    await screen.findByText('12.25');
    expect(screen.getByRole('button', { name: 'Period Results' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annual Results' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Annual Results' }));
    expect(navigation.replace).toHaveBeenCalledWith('/grades/results?resultType=ANNUAL&page=1', { scroll: false });
  });

  it('limits Teachers to server-scoped Subject Results and hides aggregate administration', async () => {
    const fetchMock = setupResults(); renderGrades(<ResultsWorkspace />, 'TEACHER');
    expect(await screen.findByText('12.25')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Period Results' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annual Results' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calculate Subject Result' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => /results\/(periods|annual)/.test(String(url)))).toBe(false);
  });

  it('denies Parent before any raw Result request', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); renderGrades(<ResultsWorkspace />, 'PARENT');
    expect(screen.getByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens safe Result detail without publication internals', async () => {
    setupResults(); renderGrades(<ResultsWorkspace />); await screen.findByText('12.25');
    await userEvent.click(screen.getByRole('button', { name: 'View Result' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Result publication history read API is not currently exposed.')).toBeInTheDocument();
    expect(within(dialog).getByText('CALCULATED')).toBeInTheDocument();
    expect(within(dialog).queryByText(/outbox|recipient|idempotency/i)).not.toBeInTheDocument();
  });
});

describe('Exact Result calculation routes', () => {
  const props = { schoolId, gradebooks: [{ ...gradebook, status: 'OPEN' as const }], years: [year], classes: [klass], gradebookLabel: () => '1A · Mathematics · 2026/2027', onCancel: vi.fn(), onCalculated: vi.fn() };
  it('calculates SubjectResult from exact Gradebook roster context', async () => {
    const fetchMock = setupResults(); renderGrades(<ResultCalculationForm {...props} resultType="SUBJECT" />);
    await userEvent.selectOptions(screen.getByLabelText('Gradebooks'), gradebookId);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Amrani, Sara (S-001)' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Student'), studentId); await userEvent.click(screen.getByRole('button', { name: 'Calculate Result' }));
    await waitFor(() => { const call = fetchMock.mock.calls.find(([url]) => String(url) === '/api/v1/results/subjects/calculate'); expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({ gradebookId, studentId }); });
  });

  it.each(['PERIOD', 'ANNUAL'] as const)('uses the dedicated %s calculation endpoint without browser arithmetic', async (type) => {
    const fetchMock = setupResults(); renderGrades(<ResultCalculationForm {...props} resultType={type} />);
    await userEvent.selectOptions(screen.getByLabelText('Academic Year'), yearId);
    if (type === 'PERIOD') { await waitFor(() => expect(screen.getByRole('option', { name: 'Term 1' })).toBeInTheDocument()); await userEvent.selectOptions(screen.getByLabelText('Academic Period'), periodId); }
    await userEvent.selectOptions(screen.getByLabelText('Class'), classId);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Amrani, Sara (S-001)' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Student'), studentId); await userEvent.click(screen.getByRole('button', { name: 'Calculate Result' }));
    const path = type === 'PERIOD' ? '/api/v1/results/periods/calculate' : '/api/v1/results/annual/calculate';
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === path)).toBe(true));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/curriculum-subjects'))).toBe(false);
  });
});
