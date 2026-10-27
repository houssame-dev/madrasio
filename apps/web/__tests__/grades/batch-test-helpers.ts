import * as s from '@school/database';
import {
  seedSchool,
  seedParentActor,
  seedStudentAndActors,
  seedGradebook,
  seedGrades,
  type GradesTestDb,
} from './test-helpers';
export async function seedBatchScenario(test: GradesTestDb) {
  const school = await seedSchool(test.seed);
  const actors = await seedStudentAndActors(
    test.seed,
    school.schoolId,
    school.yearId,
    school.classId,
  );
  const parent = await seedParentActor(test.seed, school.schoolId);
  const [profile] = await test.seed
    .insert(s.parents)
    .values({
      schoolId: school.schoolId,
      userId: parent.parentUserId,
      firstName: 'Parent',
      lastName: 'Fixture',
    })
    .returning();
  await test.seed
    .insert(s.parentStudents)
    .values({ schoolId: school.schoolId, parentId: profile.id, studentId: actors.studentId });
  const gradebook = await seedGradebook(
    test.seed,
    school.schoolId,
    school,
    school.subjectMathId,
    'OPEN',
  );
  await seedGrades(
    test.seed,
    school.schoolId,
    gradebook.gradebookId,
    gradebook,
    actors.studentId,
    '16',
    '18',
  );
  const actor = { userId: actors.schoolAdminUserId, schoolId: school.schoolId };
  const scope = {
    resultType: 'SUBJECT' as const,
    academicYearId: school.yearId,
    academicPeriodId: school.period1Id,
    classId: school.classId,
    gradebookId: gradebook.gradebookId,
  };
  return { school, actors: { ...actors, ...parent }, gradebook, actor, scope };
}
