import type { Role } from '@/lib/authorization/roles';
import {
  requireOperation, resolveCurrentContext, type AuthorizationDb,
} from '@/lib/authorization/server';
import { ForbiddenError } from '@/lib/errors';

import type {
  AssessmentCreate, AssessmentPatch, GradebookCreate, GradebookPatch, PageInput, PageResult,
} from '../domain/gradebook-contracts';
import {
  assertAssessmentStatusTransition, assertGradebookStatusTransition,
} from '../domain/gradebook-lifecycle';
import * as repo from '../infrastructure/repositories/gradebook-repository';
import type {
  AssessmentFilters, GradebookFilters, GradebooksDb,
} from '../infrastructure/repositories/gradebook-repository';
import { GradebookDomainError, isUniqueViolation } from './gradebook-errors';

export interface GradebookActor { userId: string | null; schoolId: string }

function paging(input: PageInput) {
  return { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
}
function page<T>(rows: T[], total: number, input: PageInput): PageResult<T> {
  return { data: rows, meta: { page: input.page, pageSize: input.pageSize, total } };
}
function view<T extends { schoolId?: string }>(row: T): Omit<T, 'schoolId'> {
  const { schoolId: _schoolId, ...data } = row;
  return data;
}
function gradebookNotFound(): never {
  throw new GradebookDomainError('GRADEBOOK_NOT_FOUND', 'Gradebook was not found.');
}
function assessmentNotFound(): never {
  throw new GradebookDomainError('ASSESSMENT_NOT_FOUND', 'Assessment was not found.');
}

async function role(db: GradebooksDb, actor: GradebookActor): Promise<Role> {
  await requireOperation(db as unknown as AuthorizationDb, actor, { scope: { kind: 'school' } });
  const context = await resolveCurrentContext(db as unknown as AuthorizationDb, actor);
  return context.role as Role;
}

async function readRole(db: GradebooksDb, actor: GradebookActor): Promise<Role> {
  await requireOperation(db as unknown as AuthorizationDb, actor, {
    permission: 'grades.read', scope: { kind: 'school' },
  });
  const currentRole = (await resolveCurrentContext(db as unknown as AuthorizationDb, actor)).role as Role;
  if (currentRole === 'PARENT') throw new ForbiddenError();
  return currentRole;
}

async function requireReadScope(
  db: GradebooksDb,
  actor: GradebookActor,
  currentRole: Role,
  gradebook: { classId: string; subjectId: string; academicYearId: string },
) {
  if (currentRole !== 'TEACHER') return;
  await requireOperation(db as unknown as AuthorizationDb, actor, {
    permission: 'grades.read',
    scope: {
      kind: 'teacher', classId: gradebook.classId,
      subjectId: gradebook.subjectId, academicYearId: gradebook.academicYearId,
    },
  });
}

async function requireManageScope(
  db: GradebooksDb,
  actor: GradebookActor,
  gradebook: { classId: string; subjectId: string; academicYearId: string },
) {
  const currentRole = await role(db, actor);
  if (currentRole === 'TEACHER') {
    await requireOperation(db as unknown as AuthorizationDb, actor, {
      permission: 'grades.enter',
      scope: {
        kind: 'teacher', classId: gradebook.classId,
        subjectId: gradebook.subjectId, academicYearId: gradebook.academicYearId,
      },
    });
    return;
  }
  await requireOperation(db as unknown as AuthorizationDb, actor, {
    permission: 'grades.manage', scope: { kind: 'school' },
  });
}

async function scopedGradebook(
  db: GradebooksDb,
  actor: GradebookActor,
  id: string,
  access: 'read' | 'manage',
) {
  const current = await repo.findGradebook(db, actor.schoolId, id);
  if (!current) gradebookNotFound();
  if (access === 'read') {
    const currentRole = await readRole(db, actor);
    await requireReadScope(db, actor, currentRole, current);
  } else {
    await requireManageScope(db, actor, current);
  }
  return current;
}

function assertAssessmentDate(date: string | null | undefined, period: {
  startDate: string; endDate: string;
}) {
  if (date != null && (date < period.startDate || date > period.endDate)) {
    throw new GradebookDomainError(
      'INVALID_ASSESSMENT_DATE',
      'Assessment date must fall within the Gradebook AcademicPeriod.',
    );
  }
}

export async function listGradebooks(
  db: GradebooksDb,
  actor: GradebookActor,
  input: PageInput & GradebookFilters,
) {
  const currentRole = await readRole(db, actor);
  const result = await repo.listGradebooks(
    db, actor.schoolId, paging(input), input,
    currentRole === 'TEACHER' ? actor.userId! : undefined,
  );
  return page(result.rows.map(view), result.total, input);
}

export async function getGradebook(db: GradebooksDb, actor: GradebookActor, id: string) {
  return view(await scopedGradebook(db, actor, id, 'read'));
}

export async function createGradebook(
  db: GradebooksDb,
  actor: GradebookActor,
  input: GradebookCreate,
) {
  await requireManageScope(db, actor, input);
  const context = await repo.findAcademicContext(db, actor.schoolId, input);
  if (!context.year || !context.period || !context.klass || !context.subject || !context.configuration) {
    throw new GradebookDomainError(
      'INVALID_GRADEBOOK_CONTEXT',
      'Gradebook academic context is not available in the current School.',
    );
  }
  if (
    context.period.academicYearId !== input.academicYearId ||
    context.klass.academicYearId !== input.academicYearId
  ) {
    throw new GradebookDomainError(
      'INVALID_GRADEBOOK_CONTEXT',
      'AcademicPeriod and Class must belong to the exact AcademicYear.',
    );
  }
  if (!['PLANNED', 'ACTIVE'].includes(context.year.status)) {
    throw new GradebookDomainError('INVALID_GRADEBOOK_CONTEXT', 'AcademicYear is not operational.');
  }
  if (!['PLANNED', 'ACTIVE'].includes(context.period.status)) {
    throw new GradebookDomainError('INVALID_GRADEBOOK_CONTEXT', 'AcademicPeriod is not operational.');
  }
  if (context.klass.status !== 'ACTIVE' || context.subject.status !== 'ACTIVE') {
    throw new GradebookDomainError(
      'INVALID_GRADEBOOK_CONTEXT',
      'New Gradebooks require an ACTIVE Class and Subject.',
    );
  }
  if (context.configuration.status !== 'ACTIVE' || context.configuration.configurationStatus !== 'ACTIVE') {
    throw new GradebookDomainError(
      'INVALID_GRADEBOOK_CONTEXT',
      'New Gradebooks require an ACTIVE GradingConfiguration and exact ACTIVE version.',
    );
  }
  if (await repo.findGradebookByContext(db, actor.schoolId, input)) {
    throw new GradebookDomainError('DUPLICATE_GRADEBOOK', 'This Gradebook academic context already exists.');
  }
  try {
    return view(await repo.insertGradebook(db, {
      ...input, schoolId: actor.schoolId, status: 'DRAFT',
    }));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new GradebookDomainError('DUPLICATE_GRADEBOOK', 'This Gradebook academic context already exists.');
    }
    throw error;
  }
}

export async function patchGradebook(
  db: GradebooksDb,
  actor: GradebookActor,
  id: string,
  input: GradebookPatch,
) {
  const current = await scopedGradebook(db, actor, id, 'manage');
  if (input.status) assertGradebookStatusTransition(current.status, input.status);
  if (input.name !== undefined && (current.status === 'CLOSED' || current.status === 'ARCHIVED')) {
    throw new GradebookDomainError('GRADEBOOK_NOT_EDITABLE', 'Closed or archived Gradebooks are read-only.');
  }
  return view((await repo.updateGradebook(db, actor.schoolId, id, input)) ?? gradebookNotFound());
}

export async function listAssessments(
  db: GradebooksDb,
  actor: GradebookActor,
  gradebookId: string,
  input: PageInput & AssessmentFilters,
) {
  await scopedGradebook(db, actor, gradebookId, 'read');
  const result = await repo.listAssessments(db, actor.schoolId, gradebookId, paging(input), input);
  return page(result.rows.map(view), result.total, input);
}

export async function getAssessment(db: GradebooksDb, actor: GradebookActor, id: string) {
  const current = await repo.findAssessment(db, actor.schoolId, id);
  if (!current) assessmentNotFound();
  await scopedGradebook(db, actor, current.gradebook.id, 'read');
  return view(current.assessment);
}

export async function createAssessment(
  db: GradebooksDb,
  actor: GradebookActor,
  gradebookId: string,
  input: AssessmentCreate,
) {
  const gradebook = await scopedGradebook(db, actor, gradebookId, 'manage');
  if (gradebook.status !== 'DRAFT' && gradebook.status !== 'OPEN') {
    throw new GradebookDomainError(
      'GRADEBOOK_NOT_EDITABLE',
      'Assessments cannot be created in a closed or archived Gradebook.',
    );
  }
  const period = await repo.findPeriodDates(db, actor.schoolId, gradebookId);
  if (!period) gradebookNotFound();
  if (period.status === 'CLOSED') {
    throw new GradebookDomainError(
      'GRADEBOOK_NOT_EDITABLE',
      'Assessments cannot be created in a CLOSED AcademicPeriod.',
    );
  }
  assertAssessmentDate(input.assessmentDate, period);
  return view(await repo.insertAssessment(db, {
    ...input, schoolId: actor.schoolId, gradebookId, status: 'DRAFT',
  }));
}

export async function patchAssessment(
  db: GradebooksDb,
  actor: GradebookActor,
  id: string,
  input: AssessmentPatch,
) {
  const current = await repo.findAssessment(db, actor.schoolId, id);
  if (!current) assessmentNotFound();
  await requireManageScope(db, actor, current.gradebook);
  if (current.gradebook.status === 'CLOSED' || current.gradebook.status === 'ARCHIVED') {
    throw new GradebookDomainError('GRADEBOOK_NOT_EDITABLE', 'Closed or archived Gradebooks are read-only.');
  }
  if (current.assessment.status === 'ARCHIVED') {
    throw new GradebookDomainError('ASSESSMENT_NOT_EDITABLE', 'Archived Assessments are read-only.');
  }
  if (input.status) assertAssessmentStatusTransition(current.assessment.status, input.status);
  const structural = input.title !== undefined || input.assessmentType !== undefined ||
    input.maximumScore !== undefined || input.weight !== undefined || input.assessmentDate !== undefined;
  if (current.assessment.status === 'PUBLISHED' && structural) {
    throw new GradebookDomainError('ASSESSMENT_NOT_EDITABLE', 'Published Assessment structure is immutable.');
  }
  const calculationStructural = input.assessmentType !== undefined || input.maximumScore !== undefined ||
    input.weight !== undefined || input.assessmentDate !== undefined;
  if (calculationStructural && await repo.assessmentHasGrades(db, actor.schoolId, id)) {
    throw new GradebookDomainError(
      'ASSESSMENT_NOT_EDITABLE',
      'Assessment grading fields are immutable after Grades exist.',
    );
  }
  assertAssessmentDate(input.assessmentDate, {
    startDate: current.periodStartDate, endDate: current.periodEndDate,
  });
  return view((await repo.updateAssessment(db, actor.schoolId, id, input)) ?? assessmentNotFound());
}
