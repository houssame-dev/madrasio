import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '@/components/app/dashboard';
import { schoolCalendarToday } from '@/lib/frontend/attendance/schemas';
import { assignment, classId, endedAssignment, page, renderDashboard, secondAssignment, successfulDashboardFetch, teacher, teacherId, yearId } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

describe('role-aware Dashboard', () => {
  it('renders the Teacher operational dashboard from self-scoped profiles and ACTIVE assignments', async () => {
    const fetchMock = successfulDashboardFetch([assignment, secondAssignment, endedAssignment], 4);
    renderDashboard(<Dashboard />);
    expect(await screen.findByRole('heading', { name: 'Teacher Dashboard' })).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'My classes & academic work' });
    expect(screen.getByText('Leila Amrani', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByText('Physics')).toBeInTheDocument();
    expect(screen.getByText('2026/2027')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: '1A' })).toHaveLength(1);
    expect(within(screen.getByText('Subjects').closest('article')!).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByText('Unread notifications').closest('a')!).getByText('4')).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.find((url) => url.startsWith('/api/v1/teachers?'))).toBe('/api/v1/teachers?page=1&pageSize=100&status=ACTIVE');
    expect(urls.find((url) => url.includes('/assignments'))).toContain('status=ACTIVE');
    expect(urls.every((url) => !url.includes('schoolId=') && !url.includes('userId='))).toBe(true);
  });

  it('loads the School Admin overview through school-scoped endpoints and retains authorized quick actions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input) === '/api/v1/dashboard' ? Response.json({ data: { date: '2026-10-24', timezone: 'UTC', years: [], academicYear: null, selectedYear: null, metrics: null, lessons: [] } }) : Response.json(page([])));
    renderDashboard(<Dashboard />, 'SCHOOL_ADMIN');
    expect(screen.getByRole('heading', { name: 'School Admin Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText('Take attendance')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent announcements' })).toBeInTheDocument();
    expect(screen.getAllByRole('link').slice(0, 4).map(link => link.getAttribute('href'))).toEqual(['/announcements', '/finance', '/timetable', '/students']);
    expect(await screen.findByText('Select an academic year to see its operational overview.')).toBeInTheDocument();
    expect(screen.queryByText('Application foundation')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(call => !String(call[0]).includes('schoolId='))).toBe(true);
  });

  it('shows a controlled missing-profile state and never falls back to School-wide academic data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input) === '/api/v1/notifications/unread-count' ? Response.json({ data: { count: 0 } }) : Response.json(page([])));
    renderDashboard(<Dashboard />);
    expect(await screen.findByRole('heading', { name: 'No active teacher profile' })).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.startsWith('/api/v1/academic-years') || url.startsWith('/api/v1/classes') || url.startsWith('/api/v1/subjects'))).toBe(false);
    expect(screen.queryByText('Take attendance')).not.toBeInTheDocument();
  });

  it('shows a controlled no-assignment state without operational shortcuts', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/v1/teachers?')) return Response.json(page([teacher]));
      if (url.includes(`/teachers/${teacherId}/assignments`)) return Response.json(page([]));
      if (url === '/api/v1/notifications/unread-count') return Response.json({ data: { count: 0 } });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderDashboard(<Dashboard />);
    expect(await screen.findByRole('heading', { name: 'No active teaching assignments' })).toBeInTheDocument();
    expect(screen.queryByText('Take attendance')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls).toHaveLength(3);
  });

  it('maps a self-profile API failure to a retryable error while unread count remains supplemental', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input) === '/api/v1/notifications/unread-count' ? Response.json({ data: { count: 1 } }) : new Response('gateway', { status: 502 }));
    renderDashboard(<Dashboard />);
    expect(await screen.findByRole('heading', { name: 'Teaching workspace unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('uses exact supported deep links and never adds Subject to Attendance or Homework', async () => {
    successfulDashboardFetch();
    renderDashboard(<Dashboard />);
    const card = await screen.findByRole('article', { name: '1A' });
    expect(within(card).getByRole('link', { name: 'View attendance' })).toHaveAttribute('href', `/attendance?section=daily&academicYearId=${yearId}&classId=${classId}&date=${schoolCalendarToday('UTC')}`);
    expect(within(card).getByRole('link', { name: 'Gradebooks · Mathematics · 1A' })).toHaveAttribute('href', `/grades?academicYearId=${yearId}&classId=${classId}&subjectId=${assignment.subjectId}`);
    const homework = within(card).getByRole('link', { name: 'Homework · Mathematics · 1A' });
    expect(homework).toHaveAttribute('href', `/homework?academicYearId=${yearId}&classId=${classId}`);
    expect(homework.getAttribute('href')).not.toContain('subjectId');
    expect(screen.getByRole('heading', { name: 'Recent announcements' }).parentElement!.querySelector('a')).toHaveAttribute('href', '/announcements/inbox');
    expect(screen.getByRole('heading', { name: 'Your notifications' }).parentElement!.querySelector('a')).toHaveAttribute('href', '/notifications');
  });

  it('uses bounded operational and recipient reads without learner or speculative analytics fetches', async () => {
    const fetchMock = successfulDashboardFetch([assignment, secondAssignment]);
    renderDashboard(<Dashboard />);
    await screen.findByRole('heading', { name: 'My classes & academic work' });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toHaveLength(9);
    expect(urls.some((url) => /students|gradebooks|homeworks|timetable|analytics/.test(url))).toBe(false);
    expect(screen.queryByText(/attendance percentage|average score/i)).not.toBeInTheDocument();
  });
});
