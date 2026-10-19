import type { state } from '@/lib/modules/timetable/application/service';
import type { getDraft } from '@/lib/modules/timetable/application/builder';
import type { DraftInput } from '@/lib/modules/timetable/domain/builder';
export type BuilderData = Awaited<ReturnType<typeof getDraft>>;
export const tid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function builderFixture(): { state: Awaited<ReturnType<typeof state>>; draft: BuilderData } {
  const now = new Date('2025-09-01T08:00:00Z'), stamps = { createdAt: now, updatedAt: now };
  const classRow: BuilderData['classRow'] = { id: tid(4), schoolId: tid(1), academicYearId: tid(2), levelId: tid(5), curriculumVersionId: tid(7), trackId: null, name: 'Class A', status: 'ACTIVE', ...stamps };
  const period: BuilderData['period'] = { id: tid(3), schoolId: tid(1), academicYearId: tid(2), name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-20', status: 'ACTIVE', ...stamps };
  const configuration: NonNullable<BuilderData['configuration']> = { id: tid(12), schoolId: tid(1), academicYearId: tid(2), stageId: null, levelId: null, scopeKey: 'school', revision: 1, enabled: true, createdBy: tid(14), createdAt: now,
    days: [{ day: 1, slots: [{ kind: 'LESSON', start: '08:00', end: '09:00' }, { kind: 'BREAK', start: '09:00', end: '09:15' }, { kind: 'LESSON', start: '09:15', end: '10:15' }] }, { day: 2, slots: [{ kind: 'LESSON', start: '08:00', end: '09:00' }] }] };
  const assignment: BuilderData['assignments'][number] = { id: tid(10), schoolId: tid(1), academicYearId: tid(2), classId: tid(4), subjectId: tid(8), teacherId: tid(9), effectiveFrom: '2025-09-01', effectiveUntil: null, status: 'ACTIVE', ...stamps };
  const teacher: BuilderData['teachers'][number] = { id: tid(9), schoolId: tid(1), userId: null, firstName: 'Amina', lastName: 'Test', teacherCode: null, status: 'ACTIVE', ...stamps };
  const subject: BuilderData['subjects'][number] = { id: tid(8), schoolId: tid(1), name: 'Math', code: null, status: 'ACTIVE', ...stamps };
  const curriculumSubject: BuilderData['curriculumSubjects'][number] = { id: tid(15), schoolId: tid(1), curriculumVersionId: tid(7), subjectId: tid(8), coefficient: '1', displayOrder: 1, status: 'ACTIVE', ...stamps };
  const room: BuilderData['rooms'][number] = { id: tid(11), schoolId: tid(1), name: 'Lab', kind: 'LAB', active: true, revision: 1, createdBy: tid(14), updatedBy: tid(14), ...stamps };
  const load: BuilderData['loads'][number] = { id: tid(13), schoolId: tid(1), academicYearId: tid(2), classId: tid(4), subjectId: tid(8), curriculumVersionId: tid(7), teacherAssignmentId: tid(10), roomId: null, lessonsPerWeek: 2, durationMinutes: 60, enabled: true, revision: 1, createdBy: tid(14), createdAt: now };
  const draft: BuilderData = { draft: null, lessons: [], configuration, effectiveConfiguration: configuration, classRow, period, configurationChanged: false, contextChanged: false,
    subjects: [subject], curriculumSubjects: [curriculumSubject], assignments: [assignment], teachers: [teacher], rooms: [room], loads: [load], others: [], progress: [], issues: [], conflicts: [], editable: true };
  return { draft, state: { years: [{ id: tid(2), schoolId: tid(1), name: '2025/26', startDate: '2025-09-01', endDate: '2026-07-01', status: 'ACTIVE', ...stamps }], selectedYearId: tid(2), periods: [period], classes: [classRow],
    stages: [{ id: tid(6), schoolId: tid(1), name: 'Primary', sequence: 1, status: 'ACTIVE', ...stamps }], levels: [{ id: tid(5), schoolId: tid(1), stageId: tid(6), name: 'Level 1', sequence: 1, status: 'ACTIVE', ...stamps }],
    configurations: [configuration], loads: [load], rooms: [room], subjects: [subject], curriculumSubjects: [curriculumSubject], assignments: [{ assignment, teacherName: teacher.lastName, teacherFirstName: teacher.firstName, teacherStatus: teacher.status }], effective: [{ classId: classRow.id, configurationId: configuration.id }] } };
}
export function savedFixture(data: BuilderData, input: DraftInput): BuilderData {
  return { ...data, lessons: input.lessons, draft: { id: tid(90 + input.expectedRevision), schoolId: tid(1), academicYearId: input.academicYearId, academicPeriodId: input.academicPeriodId, classId: input.classId,
    configurationId: input.configurationId, curriculumVersionId: input.curriculumVersionId, startDate: input.startDate, endDate: input.endDate, revision: input.expectedRevision + 1,
    requestKey: input.requestKey, requestHash: 'a'.repeat(64), createdBy: tid(14), createdAt: new Date('2025-09-01T08:00:00Z') } };
}
