import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '@/components/app/dashboard';
import { ChildrenWorkspace } from '@/components/children/children-workspace';
import { ChildDetail } from '@/components/parent/child-detail';
import { otherStudentId, parent, relationshipId, renderParents, student } from '../parents/test-helpers';

const child = { relationshipId, student: { id: student.id, firstName: student.firstName, lastName: student.lastName, studentCode: student.studentCode } };
const profile = { parent: { id: parent.id, firstName: parent.firstName, lastName: parent.lastName, status: 'ACTIVE' as const }, children: [child] };
const secondProfile = { parent: { ...profile.parent, id: crypto.randomUUID(), firstName: 'Yasmina' }, children: [{ ...child, relationshipId: crypto.randomUUID() }] };
const year = { id: crypto.randomUUID(), name: '2025/2026', status: 'ACTIVE', startDate: '2025-09-01', endDate: '2026-07-01' } as const;
const placement = { effectiveFrom: '2025-09-01', effectiveUntil: null, academicYearId: year.id, academicYearName: year.name, classId: crypto.randomUUID(), className: 'Class A', levelId: crypto.randomUUID(), levelName: 'Year 1', stageId: crypto.randomUUID(), stageName: 'Primary', trackId: null, trackName: null };

function mockChildAcademic() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/v1/me/parent-profiles') return Response.json({ data: [profile] });
    if (url.endsWith('/academic-years')) return Response.json({ data: [year] });
    if (url.includes('/placement?')) return Response.json({ data: placement });
    if (url.includes('resultType=SUBJECT')) return Response.json({ data: [{ publicationId: crypto.randomUUID(), resultId: crypto.randomUUID(), resultType: 'SUBJECT', value: '15.50', publicationVersion: 2, publishedAt: new Date().toISOString(), academicYear: { id: year.id, name: year.name }, academicPeriod: { id: crypto.randomUUID(), name: 'Term 1' }, class: { id: placement.classId, name: placement.className }, subject: { id: crypto.randomUUID(), name: 'Mathematics', code: 'MATH' } }], meta: { page: 1, pageSize: 50, total: 1 } });
    if (url.includes('resultType=PERIOD')) return Response.json({ data: [{ publicationId: crypto.randomUUID(), resultId: crypto.randomUUID(), resultType: 'PERIOD', value: '14.00', publicationVersion: 1, publishedAt: new Date().toISOString(), academicYear: { id: year.id, name: year.name }, academicPeriod: { id: crypto.randomUUID(), name: 'Term 1' }, class: { id: placement.classId, name: placement.className }, subject: null }], meta: { page: 1, pageSize: 50, total: 1 } });
    if (url.includes('resultType=ANNUAL')) return Response.json({ data: [{ publicationId: crypto.randomUUID(), resultId: crypto.randomUUID(), resultType: 'ANNUAL', value: '13.00', publicationVersion: 1, publishedAt: new Date().toISOString(), academicYear: { id: year.id, name: year.name }, academicPeriod: null, class: { id: placement.classId, name: placement.className }, subject: null }], meta: { page: 1, pageSize: 50, total: 1 } });
    throw new Error(`Unexpected child academic request: ${url}`);
  });
}

function mockPortal(data = [profile], unread = 2) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/v1/me/parent-profiles') return Response.json({ data });
    if (url === '/api/v1/notifications/unread-count') return Response.json({ data: { count: unread } });
    throw new Error(`Unexpected Parent portal request: ${url}`);
  });
}

afterEach(() => vi.restoreAllMocks());

describe('Parent portal dashboard and children', () => {
  it('renders the Parent dashboard from self bootstrap, deduplicates children, and reuses unread Notifications', async () => {
    const fetchMock = mockPortal([profile, secondProfile], 5);
    renderParents(<Dashboard />, 'PARENT');
    expect(await screen.findByRole('heading', { name: 'Family workspace' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Nora Alaoui' })).toHaveLength(1);
    expect(within(screen.getByText('Related children').closest('article')!).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByText('Unread notifications').closest('article')!).getByText('5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Notifications/ })).toHaveAttribute('href', '/notifications');
    expect(screen.queryByText(/Take attendance|Open gradebooks|Announcements/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => String(call[0])).sort()).toEqual(['/api/v1/me/parent-profiles', '/api/v1/notifications/unread-count']);
  });

  it('distinguishes no active profile from active profiles without current children', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockImplementation(async (input) => String(input) === '/api/v1/notifications/unread-count' ? Response.json({ data: { count: 0 } }) : Response.json({ data: [] }));
    const first = renderParents(<Dashboard />, 'PARENT');
    expect(await screen.findByRole('heading', { name: 'No active parent profile' })).toBeInTheDocument();
    first.unmount();
    fetchMock.mockImplementation(async (input) => String(input) === '/api/v1/notifications/unread-count' ? Response.json({ data: { count: 0 } }) : Response.json({ data: [{ ...profile, children: [] }] }));
    renderParents(<Dashboard />, 'PARENT');
    expect(await screen.findByRole('heading', { name: 'No active child relationships' })).toBeInTheDocument();
  });

  it('renders a retryable bootstrap error while the unread count remains supplemental', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input) === '/api/v1/notifications/unread-count' ? Response.json({ data: { count: 1 } }) : new Response('gateway', { status: 502 }));
    renderParents(<Dashboard />, 'PARENT');
    expect(await screen.findByRole('heading', { name: 'Family workspace unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('upgrades /children from the same bootstrap and never calls broad directories', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [profile, secondProfile] }));
    renderParents(<ChildrenWorkspace />, 'PARENT');
    expect(await screen.findByRole('heading', { name: 'My children' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Nora Alaoui' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'View Nora Alaoui' })).toHaveAttribute('href', `/children/${student.id}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/me/parent-profiles');
  });

  it('gates child detail through bootstrap and renders exact-Year placement and published Result types', async () => {
    const fetchMock = mockChildAcademic();
    renderParents(<ChildDetail studentId={student.id} />, 'PARENT');
    expect(await screen.findByRole('heading', { name: 'Nora Alaoui' })).toBeInTheDocument();
    expect((await screen.findAllByText('Class A')).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Subject results' })).toBeInTheDocument();
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Period results' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Annual results' })).toBeInTheDocument();
    expect(screen.getByText('15.50')).toBeInTheDocument();
    expect(screen.getByText('Homework list discovery is not currently available for parent accounts.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Attendance/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /calculate|finalize|publish|revise|edit/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls.every((call) => !String(call[0]).includes('/api/v1/results'))).toBe(true);
  });

  it('does not guess when a child has multiple ACTIVE Academic Years', async () => {
    const secondYear = { ...year, id: crypto.randomUUID(), name: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-01' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input) === '/api/v1/me/parent-profiles' ? Response.json({ data: [profile] }) : Response.json({ data: [secondYear, year] }));
    renderParents(<ChildDetail studentId={student.id} />, 'PARENT');
    expect(await screen.findByText('Select one of this child’s Academic Years to view placement and published results.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Subject results' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('hides a foreign or unrelated child without probing Student, Result, Homework, or Attendance APIs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [profile] }));
    renderParents(<ChildDetail studentId={otherStudentId} />, 'PARENT');
    expect(await screen.findByRole('heading', { name: 'Child unavailable' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/me/parent-profiles');
  });

  it('denies non-Parent roles before bootstrap', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    renderParents(<ChildrenWorkspace />, 'TEACHER');
    expect(screen.getByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
