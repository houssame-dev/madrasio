import * as schema from '@school/database';
import * as homework from '@/lib/modules/homework/application';
import type { HomeworkDb } from '@/lib/modules/homework/infrastructure/repositories/homework-repository';
import { createActor, createStudentsTestContext, seedStudent, seedTeacherScope } from '../students/test-helpers';

export async function deliveryFixture() {
  const context = await createStudentsTestContext();
  const db = context.test.seed as unknown as HomeworkDb;
  const teacher = await createActor(context.test, context.schoolId, 'TEACHER');
  await seedTeacherScope(context, teacher, context.classAId);
  const [period] = await context.test.seed.insert(schema.academicPeriods).values({
    schoolId: context.schoolId, academicYearId: context.yearId, name: 'Term', sequence: 1,
    startDate: '2025-09-01', endDate: '2025-12-31', status: 'ACTIVE',
  }).returning();
  const draft = await homework.createHomework(db, teacher, {
    subjectId: context.subjectId, academicYearId: context.yearId, academicPeriodId: period!.id,
    title: 'Physical hand-in', dueDate: '2025-10-10',
  });
  await homework.addHomeworkTargets(db, teacher, draft.id, { classIds: [context.classAId] });
  const item = await homework.patchHomework(db, teacher, draft.id, { status: 'PUBLISHED' });
  async function student(suffix: string) {
    const child = await seedStudent(context.test, context.schoolId, suffix);
    await context.test.seed.insert(schema.studentEnrollments).values({
      schoolId: context.schoolId, studentId: child.id, academicYearId: context.yearId,
      classId: context.classAId, effectiveFrom: '2025-09-01', status: 'ACTIVE',
    });
    return child;
  }
  const child = await student('delivery');
  return { ...context, homeworkDb: db, teacher, homework: item, child, student };
}
export type DeliveryFixture = Awaited<ReturnType<typeof deliveryFixture>>;
