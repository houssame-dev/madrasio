import type { Role } from '@/lib/authorization/roles';
import {
  requireOperation, resolveCurrentContext, type AuthorizationDb,
} from '@/lib/authorization/server';
import { ForbiddenError } from '@/lib/errors';

import { DecimalValue } from '../domain/calculation';
import type { BulkGradeEntry, GradeEntry } from '../domain/grade-contracts';
import * as gradebookRepo from '../infrastructure/repositories/gradebook-repository';
import type { GradebooksDb } from '../infrastructure/repositories/gradebook-repository';
import * as repo from '../infrastructure/repositories/grade-repository';
import { GradebookDomainError } from './gradebook-errors';
import { GradeDomainError } from './grade-errors';

export interface GradeActor { userId: string | null; schoolId: string }
export interface GradeMatrixInput { page: number; pageSize: number }

function view<T extends { schoolId?: string }>(row: T): Omit<T, 'schoolId'> {
  const { schoolId: _schoolId, ...data } = row;
  return data;
}

async function currentRole(db: GradebooksDb, actor: GradeActor): Promise<Role> {
  await requireOperation(db as unknown as AuthorizationDb, actor, { scope: { kind: 'school' } });
  return (await resolveCurrentContext(db as unknown as AuthorizationDb, actor)).role as Role;
}

async function requireGradebookRead(
  db: GradebooksDb,
  actor: GradeActor,
  gradebook: { classId: string; subjectId: string; academicYearId: string },
) {
  const role = await currentRole(db, actor);
  if (role === 'PARENT') throw new ForbiddenError();
  await requireOperation(db as unknown as AuthorizationDb, actor, role === 'TEACHER' ? {
    permission: 'grades.read',
    scope: {
      kind: 'teacher', classId: gradebook.classId,
      subjectId: gradebook.subjectId, academicYearId: gradebook.academicYearId,
    },
  } : { permission: 'grades.read', scope: { kind: 'school' } });
}

async function requireGradebookWrite(
  db: GradebooksDb,
  actor: GradeActor,
  gradebook: { classId: string; subjectId: string; academicYearId: string },
) {
  const role = await currentRole(db, actor);
  await requireOperation(db as unknown as AuthorizationDb, actor, role === 'TEACHER' ? {
    permission: 'grades.enter',
    scope: {
      kind: 'teacher', classId: gradebook.classId,
      subjectId: gradebook.subjectId, academicYearId: gradebook.academicYearId,
    },
  } : { permission: 'grades.manage', scope: { kind: 'school' } });
}

function assertScore(entry: GradeEntry, maximumScore: string) {
  if (entry.state === 'VALID' && DecimalValue.parse(entry.score).gt(DecimalValue.parse(maximumScore))) {
    throw new GradeDomainError(
      'INVALID_GRADE_SCORE',
      'A VALID Grade score cannot exceed the Assessment maximumScore.',
    );
  }
}

export async function putAssessmentGrades(
  db: GradebooksDb,
  actor: GradeActor,
  assessmentId: string,
  input: BulkGradeEntry,
) {
  const context = await gradebookRepo.findAssessment(db, actor.schoolId, assessmentId);
  if (!context) {
    throw new GradebookDomainError('ASSESSMENT_NOT_FOUND', 'Assessment was not found.');
  }
  await requireGradebookWrite(db, actor, context.gradebook);
  if (context.gradebook.status !== 'OPEN') {
    throw new GradeDomainError('GRADE_ENTRY_NOT_ALLOWED', 'Grade entry requires an OPEN Gradebook.');
  }
  if (context.assessment.status !== 'PUBLISHED') {
    throw new GradeDomainError(
      'GRADE_ENTRY_NOT_ALLOWED',
      'Grade entry requires a PUBLISHED Assessment.',
    );
  }

  const rows = await db.transaction(async (tx) => {
    const transactionDb = tx as unknown as GradebooksDb;
    const written = [];
    for (const entry of input.grades) {
      assertScore(entry, context.assessment.maximumScore);
      const eligible = await repo.findEligibleStudent(transactionDb, {
        schoolId: actor.schoolId,
        studentId: entry.studentId,
        academicYearId: context.gradebook.academicYearId,
        classId: context.gradebook.classId,
        assessmentDate: context.assessment.assessmentDate,
      });
      if (!eligible) {
        throw new GradeDomainError(
          'STUDENT_NOT_ELIGIBLE_FOR_ASSESSMENT',
          'Student was not enrolled in the Gradebook Class for the applicable Assessment date.',
        );
      }
      written.push(await repo.upsertGrade(transactionDb, {
        schoolId: actor.schoolId,
        gradebookId: context.gradebook.id,
        assessmentId: context.assessment.id,
        studentId: entry.studentId,
        state: entry.state,
        score: entry.state === 'VALID' ? entry.score : null,
      }));
    }
    return written;
  });
  return { grades: rows.map(view) };
}

export async function getGradebookMatrix(
  db: GradebooksDb,
  actor: GradeActor,
  gradebookId: string,
  input: GradeMatrixInput,
) {
  const gradebook = await gradebookRepo.findGradebook(db, actor.schoolId, gradebookId);
  if (!gradebook) {
    throw new GradebookDomainError('GRADEBOOK_NOT_FOUND', 'Gradebook was not found.');
  }
  await requireGradebookRead(db, actor, gradebook);
  const paging = { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
  const assessmentLimit = 100;
  const [studentPage, assessments, assessmentTotal] = await Promise.all([
    repo.listMatrixStudents(
      db, actor.schoolId, gradebook.academicYearId, gradebook.classId, paging,
    ),
    repo.listMatrixAssessments(db, actor.schoolId, gradebook.id, assessmentLimit),
    repo.countMatrixAssessments(db, actor.schoolId, gradebook.id),
  ]);
  const grades = await repo.findMatrixGrades(
    db,
    actor.schoolId,
    gradebook.id,
    studentPage.rows.map((student) => student.id),
    assessments.map((assessment) => assessment.id),
  );
  const gradesByStudent = new Map<string, typeof grades>();
  for (const grade of grades) {
    const collection = gradesByStudent.get(grade.studentId) ?? [];
    collection.push(grade);
    gradesByStudent.set(grade.studentId, collection);
  }
  return {
    data: {
      gradebook: view(gradebook),
      assessments: assessments.map(view),
      students: studentPage.rows.map((student) => ({
        student,
        grades: (gradesByStudent.get(student.id) ?? []).map(view),
      })),
    },
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total: studentPage.total,
      assessmentLimit,
      assessmentTotal,
    },
  };
}

