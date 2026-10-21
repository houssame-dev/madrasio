import { randomUUID } from 'node:crypto';
import * as s from '@school/database';
import { createActor, createStudentsTestContext, seedStudent, seedTeacherScope } from '../students/test-helpers';
import { saveConfiguration, type TimetableDb } from '@/lib/modules/timetable/application/service';
import { saveDraft } from '@/lib/modules/timetable/application/builder';
import { publishDraft } from '@/lib/modules/timetable/application/publication';
import type { AttendanceDb } from '@/lib/modules/attendance/infrastructure/repositories/attendance-repository';
export const sessionNow = new Date('2025-10-10T12:00:00Z');
export async function sessionFixture() {
  const c = await createStudentsTestContext(), db = c.test.seed as unknown as AttendanceDb;
  const teacher = await createActor(c.test, c.schoolId, 'TEACHER'), scope = await seedTeacherScope(c, teacher, c.classAId);
  const student = await seedStudent(c.test, c.schoolId), otherStudent = await seedStudent(c.test, c.schoolId, 'two');
  await c.test.seed.insert(s.studentEnrollments).values({ schoolId: c.schoolId, studentId: student.id, academicYearId: c.yearId, classId: c.classAId, effectiveFrom: '2025-09-01', status: 'ACTIVE' });
  const [period] = await c.test.seed.insert(s.academicPeriods).values({ schoolId: c.schoolId, academicYearId: c.yearId, name: 'Term', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-20', status: 'ACTIVE' }).returning();
  await c.test.seed.insert(s.curriculumSubjects).values({ schoolId: c.schoolId, curriculumVersionId: c.curriculumVersionId, subjectId: c.subjectId, coefficient: '1', status: 'ACTIVE' });
  const timetableDb = c.test.seed as unknown as TimetableDb;
  const config = await saveConfiguration(timetableDb, c.admin, { academicYearId: c.yearId, expectedRevision: 0, days: [{ day: 5, slots: [{ kind: 'LESSON', start: '08:00', end: '09:00' }, { kind: 'LESSON', start: '09:00', end: '10:00' }] }] });
  const lessonKeys = [randomUUID(), randomUUID()];
  const draft = await saveDraft(timetableDb, c.admin, { academicYearId: c.yearId, academicPeriodId: period.id, classId: c.classAId, configurationId: config.id, curriculumVersionId: c.curriculumVersionId, startDate: period.startDate, endDate: period.endDate, expectedRevision: 0, requestKey: randomUUID(), lessons: lessonKeys.map((lessonKey, i) => ({ lessonKey, weekday: 5, start: i ? '09:00' : '08:00', end: i ? '10:00' : '09:00', subjectId: c.subjectId, teacherAssignmentId: scope.assignment.id, roomId: null })) });
  const publication = await publishDraft(timetableDb, c.admin, { academicYearId: c.yearId, academicPeriodId: period.id, classId: c.classAId, draftId: draft.id, expectedRevision: draft.revision, expectedSequence: 0, effectiveFrom: period.startDate, requestKey: randomUUID(), confirm: true }, new Date('2025-09-01T00:00:00Z'));
  return { ...c, db, teacherActor: teacher, scope, student, otherStudent, lessonKeys, publication, identity: { publicationId: publication.id, lessonKey: lessonKeys[0], date: '2025-10-10' } };
}
