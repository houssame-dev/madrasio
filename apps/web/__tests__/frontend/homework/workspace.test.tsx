import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeworkWorkspace } from '@/components/homework/homework-workspace';
import { assignmentA, classA, classAId, homework, homeworkId, page, period, periodId, renderHomework, subject, subjectId, teacher, teacherId, year, yearId } from './test-helpers';

const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/homework', useRouter: () => ({ replace: navigation.replace, push: navigation.push }), useSearchParams: () => new URLSearchParams(navigation.search) }));
afterEach(() => { vi.restoreAllMocks(); navigation.search = ''; navigation.replace.mockReset(); navigation.push.mockReset(); });

function setup(options: { assignments?: typeof assignmentA[]; list?: typeof homework[] } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('/api/v1/homeworks?') && !(init as RequestInit | undefined)?.method) return Response.json(page(options.list ?? [homework], 1, 20));
    if (url === '/api/v1/academic-years?page=1&pageSize=100') return Response.json(page([year], 1, 100));
    if (url === '/api/v1/classes?page=1&pageSize=100') return Response.json(page([classA], 1, 100));
    if (url === '/api/v1/subjects?page=1&pageSize=100') return Response.json(page([subject], 1, 100));
    if (url === '/api/v1/teachers?status=ACTIVE&page=1&pageSize=100') return Response.json(page([teacher], 1, 100));
    if (url === `/api/v1/teachers/${teacherId}/assignments?status=ACTIVE&page=1&pageSize=100`) return Response.json(page(options.assignments ?? [assignmentA], 1, 100));
    if (url === `/api/v1/academic-years/${yearId}/periods?page=1&pageSize=100`) return Response.json(page([period], 1, 100));
    if (url === '/api/v1/homeworks' && (init as RequestInit | undefined)?.method === 'POST') return Response.json({ data: homework }, { status: 201 });
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe('Homework workspace', () => {
  it('renders the server-scoped list without target N+1 and sends filters to the backend', async () => {
    navigation.search = `status=DRAFT&academicYearId=${yearId}&classId=${classAId}&dueFrom=2025-10-01&dueTo=2025-10-31&search=Fractions`; const fetchMock = setup(); renderHomework(<HomeworkWorkspace />, 'TEACHER');
    expect(await screen.findByText('Fractions practice')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`status=DRAFT`) && String(url).includes(`classId=${classAId}`) && String(url).includes('search=Fractions'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`/homeworks/${homeworkId}/targets`))).toBe(false);
  });

  it('creates an exact plain-text DATE payload with server-derived Teacher identity and no Grade fields', async () => {
    const fetchMock = setup(); renderHomework(<HomeworkWorkspace />); await screen.findByText('Fractions practice'); await userEvent.click(screen.getByRole('button', { name: 'Create Homework' }));
    await userEvent.selectOptions(document.querySelector('#homework-year')!, yearId); await userEvent.selectOptions(await screen.findByLabelText('Academic Period'), periodId); await userEvent.selectOptions(screen.getByLabelText('Subject'), subjectId);
    await userEvent.type(screen.getByLabelText('Title'), 'Practice set'); await userEvent.type(screen.getByLabelText('Description'), '<b>plain</b>'); await userEvent.type(screen.getByLabelText('Due date'), '2025-10-10'); const actions = screen.getAllByRole('button', { name: 'Create Homework' }); await userEvent.click(actions[actions.length - 1]!);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`/homework/${homeworkId}`));
    const call = fetchMock.mock.calls.find(([url, init]) => String(url) === '/api/v1/homeworks' && (init as RequestInit | undefined)?.method === 'POST'); const payload = JSON.parse(String((call?.[1] as RequestInit).body));
    expect(payload).toEqual({ academicYearId: yearId, academicPeriodId: periodId, subjectId, title: 'Practice set', description: '<b>plain</b>', dueDate: '2025-10-10' });
    expect(payload).not.toHaveProperty('teacherId'); expect(payload).not.toHaveProperty('assessmentId'); expect(payload).not.toHaveProperty('grade'); expect(payload).not.toHaveProperty('schoolId');
  });

  it('shows the SchoolAdmin authorship limitation instead of inventing a Teacher selector', async () => {
    setup({ assignments: [] }); renderHomework(<HomeworkWorkspace />); expect(await screen.findByText(/Creation requires this signed-in User/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Create Homework' })).not.toBeInTheDocument(); expect(screen.queryByLabelText(/Teacher/)).not.toBeInTheDocument();
  });

  it('denies Parent broad management before any request', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); renderHomework(<HomeworkWorkspace />, 'PARENT'); expect(screen.getByText('Access unavailable')).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
  });
});
