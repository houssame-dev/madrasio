import { screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionAttendancePanel } from '@/components/attendance/session-attendance-panel';
import { renderAttendance, schoolId, roster } from '../attendance/test-helpers';
const hint = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => hint.params }));
const publicationId = '11111111-1111-4111-8111-111111111111', lessonKey = '22222222-2222-4222-8222-222222222222';
afterEach(() => vi.restoreAllMocks());
it.each([true, false])('only opens a URL-hinted roster if server session scope includes it: %s', async authorized => {
  hint.params = new URLSearchParams({ date: '2025-10-10', publicationId, lessonKey });
  const session = { publicationId, lessonKey, date: '2025-10-10', start: '08:00', end: '09:00', className: 'Class A', subjectName: 'Math', writable: false };
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input).startsWith('/api/v1/attendance/sessions?') ? Response.json({ data: { date: '2025-10-10', sessions: authorized ? [session] : [] } }) : Response.json({ ...roster, data: { ...roster.data, session, students: [] } }));
  renderAttendance(<SessionAttendancePanel schoolId={schoolId} timezone="UTC" onDirtyChange={() => {}} />, 'TEACHER');
  if (authorized) await screen.findByRole('heading', { name: 'Math — Class A' }); else await screen.findByText('No authorized published sessions for this date.');
  expect(fetcher.mock.calls.some(([url]) => String(url).startsWith('/api/v1/attendance/session?'))).toBe(authorized);
  expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
});
