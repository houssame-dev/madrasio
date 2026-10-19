import type { readPublished } from '@/lib/modules/timetable/application/publication';
import type { Role } from '@/lib/authorization/roles';
import { tid } from './builder-fixture';
export type PublishedData = Awaited<ReturnType<typeof readPublished>>;
export function publishedFixture(role: Exclude<Role, 'SUPER_ADMIN'> = 'SCHOOL_ADMIN'): PublishedData {
  const schedule: PublishedData['schedules'][number] = { id: tid(80), classId: tid(4), sequence: 1, effectiveFrom: '2025-09-01', effectiveUntil: '2025-12-20', publishedAt: new Date('2025-09-01T10:00:00Z'), className: 'Class A', yearName: '2025/26', periodName: 'Term 1', timezone: 'Africa/Casablanca',
    lessons: [{ lessonKey: tid(70), weekday: 1, start: '08:00', end: '09:00', subjectId: tid(8), subjectName: 'Math', teacherAssignmentId: tid(10), teacherId: tid(9), teacherName: 'Amina Test', roomId: tid(11), roomName: 'Lab' }] };
  return { date: '2025-09-01', today: '2025-09-01', role, classes: role === 'SCHOOL_ADMIN' ? [{ id: tid(4), name: 'Class A' }] : [], teachers: role === 'SCHOOL_ADMIN' ? [{ id: tid(9), name: 'Amina Test' }] : [], children: role === 'PARENT' ? [{ id: tid(37), name: 'Child One' }, { id: tid(38), name: 'Child Two' }] : [], selectedStudentId: role === 'PARENT' ? tid(37) : null, schedules: [schedule], history: role === 'SCHOOL_ADMIN' ? [schedule] : [], latestSequence: role === 'SCHOOL_ADMIN' ? 1 : 0, latestEffectiveFrom: role === 'SCHOOL_ADMIN' ? '2025-09-01' : null };
}
