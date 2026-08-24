import type { Role } from '@/lib/authorization/roles';
import {
  requireOperation, resolveCurrentContext, resolveTeacherScope, type AuthorizationDb,
} from '@/lib/authorization/server';
import { ForbiddenError } from '@/lib/errors';

import type {
  HomeworkCreateInput, HomeworkListInput, HomeworkPatchInput, HomeworkSubmissionCreateInput,
  HomeworkSubmissionPatchInput, HomeworkSubmissionReviewInput, HomeworkTargetsCreateInput,
  PageInput, SubmissionListInput,
} from '../domain/contracts';
import * as repo from '../infrastructure/repositories/homework-repository';
import type { HomeworkDb } from '../infrastructure/repositories/homework-repository';
import { HomeworkDomainError, isUniqueViolation } from './homework-errors';

export interface HomeworkActor { userId: string | null; schoolId: string }

const transitions: Readonly<Record<string, string | undefined>> = {
  DRAFT: 'PUBLISHED',
  PUBLISHED: 'CLOSED',
  CLOSED: 'ARCHIVED',
  ARCHIVED: undefined,
};

function paging(input: PageInput) {
  return { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
}
function view<T extends { schoolId?: string }>(row: T): Omit<T, 'schoolId'> {
  const { schoolId: _schoolId, ...data } = row;
  return data;
}
function homeworkNotFound(): never {
  throw new HomeworkDomainError('HOMEWORK_NOT_FOUND', 'Homework was not found.');
}
function submissionNotFound(): never {
  throw new HomeworkDomainError('HOMEWORK_SUBMISSION_NOT_FOUND', 'Homework Submission was not found.');
}

async function context(db: HomeworkDb, actor: HomeworkActor) {
  await requireOperation(db as unknown as AuthorizationDb, actor, { scope: { kind: 'school' } });
  return resolveCurrentContext(db as unknown as AuthorizationDb, actor);
}

async function requirePermission(
  db: HomeworkDb,
  actor: HomeworkActor,
  permission: 'homework.read' | 'homework.manage',
) {
  await requireOperation(db as unknown as AuthorizationDb, actor, { permission, scope: { kind: 'school' } });
}

async function teacherAssignments(db: HomeworkDb, actor: HomeworkActor) {
  if (!actor.userId) return [];
  return resolveTeacherScope(db as unknown as AuthorizationDb, actor.userId, actor.schoolId);
}

function assignmentMatches(
  assignments: Awaited<ReturnType<typeof teacherAssignments>>,
  homework: { subjectId: string; academicYearId: string },
  classId: string,
) {
  return assignments.some((assignment) => assignment.status === 'ACTIVE'
    && assignment.classId === classId
    && assignment.subjectId === homework.subjectId
    && assignment.academicYearId === homework.academicYearId);
}

async function authorizeHomework(
  db: HomeworkDb,
  actor: HomeworkActor,
  homework: NonNullable<Awaited<ReturnType<typeof repo.findHomework>>>,
  mode: 'read' | 'manage',
) {
  const current = await context(db, actor);
  const role = current.role as Role;
  await requirePermission(db, actor, mode === 'read' ? 'homework.read' : 'homework.manage');
  if (role === 'SCHOOL_ADMIN' || role === 'SUPER_ADMIN') return role;

  if (role === 'PARENT') {
    if (mode === 'manage' || homework.status === 'DRAFT' || !actor.userId) {
      throw new ForbiddenError('Parents cannot manage Homework.');
    }
    const student = await repo.findParentEligibleStudent(db, {
      schoolId: actor.schoolId, userId: actor.userId, homeworkId: homework.id, dueDate: homework.dueDate,
    });
    if (!student) throw new ForbiddenError('Homework is outside the Parent scope.');
    await requireOperation(db as unknown as AuthorizationDb, actor, {
      permission: 'homework.read', scope: { kind: 'parent', studentId: student.studentId },
    });
    return role;
  }

  const targets = await repo.listTargets(db, actor.schoolId, homework.id);
  const assignments = await teacherAssignments(db, actor);
  if (targets.length === 0) {
    const author = actor.userId && await repo.findActiveAuthorTeacher(
      db, actor.schoolId, actor.userId, homework.subjectId, homework.academicYearId,
    );
    if (!author || author.id !== homework.teacherId) throw new ForbiddenError('Homework is outside the Teacher scope.');
    return role;
  }
  const matches = targets.map((target) => assignmentMatches(assignments, homework, target.classId));
  if (mode === 'manage' ? matches.some((match) => !match) : matches.every((match) => !match)) {
    throw new ForbiddenError('Homework is outside the Teacher scope.');
  }
  return role;
}

function assertDueDate(
  dueDate: string,
  academicYear: { startDate: string; endDate: string },
  academicPeriod: { startDate: string; endDate: string },
) {
  if (dueDate < academicYear.startDate || dueDate > academicYear.endDate
    || dueDate < academicPeriod.startDate || dueDate > academicPeriod.endDate) {
    throw new HomeworkDomainError(
      'INVALID_HOMEWORK_CONTEXT',
      'Homework due date must fall within its AcademicPeriod and AcademicYear.',
    );
  }
}

async function academicContext(db: HomeworkDb, actor: HomeworkActor, input: {
  subjectId: string; academicYearId: string; academicPeriodId: string; dueDate: string;
}) {
  const academic = await repo.findAcademicContext(db, actor.schoolId, input);
  if (!academic) throw new HomeworkDomainError('INVALID_HOMEWORK_CONTEXT', 'Homework academic context is invalid.');
  if (academic.subject.status !== 'ACTIVE'
    || ['CLOSED', 'ARCHIVED'].includes(academic.academicYear.status)
    || academic.academicPeriod.status === 'CLOSED') {
    throw new HomeworkDomainError('INVALID_HOMEWORK_CONTEXT', 'Homework requires an operational academic context.');
  }
  assertDueDate(input.dueDate, academic.academicYear, academic.academicPeriod);
  return academic;
}

export async function createHomework(db: HomeworkDb, actor: HomeworkActor, input: HomeworkCreateInput) {
  await requirePermission(db, actor, 'homework.manage');
  await academicContext(db, actor, input);
  if (!actor.userId) throw new ForbiddenError();
  const teacher = await repo.findActiveAuthorTeacher(
    db, actor.schoolId, actor.userId, input.subjectId, input.academicYearId,
  );
  if (!teacher) {
    throw new ForbiddenError('Homework creation requires an active Teacher profile and assignment.');
  }
  const row = await repo.insertHomework(db, {
    schoolId: actor.schoolId,
    teacherId: teacher.id,
    subjectId: input.subjectId,
    academicYearId: input.academicYearId,
    academicPeriodId: input.academicPeriodId,
    title: input.title,
    description: input.description ?? null,
    dueDate: input.dueDate,
    status: 'DRAFT',
  });
  return view(row);
}

export async function listHomework(db: HomeworkDb, actor: HomeworkActor, input: HomeworkListInput) {
  const current = await context(db, actor);
  await requirePermission(db, actor, 'homework.read');
  if (current.role === 'PARENT') throw new ForbiddenError('Parents cannot access the broad Homework list.');
  const result = await repo.listHomework(
    db, actor.schoolId, paging(input), input,
    current.role === 'TEACHER' ? actor.userId ?? undefined : undefined,
  );
  return {
    data: result.rows.map(view),
    meta: { page: input.page, pageSize: input.pageSize, total: result.total },
  };
}

export async function getHomework(db: HomeworkDb, actor: HomeworkActor, id: string) {
  const homework = await repo.findHomework(db, actor.schoolId, id);
  if (!homework) homeworkNotFound();
  await authorizeHomework(db, actor, homework, 'read');
  return view(homework);
}

export async function patchHomework(
  db: HomeworkDb,
  actor: HomeworkActor,
  id: string,
  input: HomeworkPatchInput,
) {
  const homework = await repo.findHomework(db, actor.schoolId, id);
  if (!homework) homeworkNotFound();
  await authorizeHomework(db, actor, homework, 'manage');
  const structural = input.title !== undefined || input.description !== undefined || input.dueDate !== undefined;
  if (homework.status !== 'DRAFT' && structural) {
    throw new HomeworkDomainError('HOMEWORK_NOT_EDITABLE', 'Published Homework content and dates are immutable.');
  }
  if (input.dueDate) {
    const academic = await repo.findAcademicContext(db, actor.schoolId, homework);
    if (!academic) throw new HomeworkDomainError('INVALID_HOMEWORK_CONTEXT', 'Homework academic context is invalid.');
    assertDueDate(input.dueDate, academic.academicYear, academic.academicPeriod);
  }
  if (input.status !== undefined) {
    if (transitions[homework.status] !== input.status) {
      throw new HomeworkDomainError(
        'INVALID_HOMEWORK_STATUS_TRANSITION',
        `Homework cannot transition from ${homework.status} to ${input.status}.`,
      );
    }
    if (input.status === 'PUBLISHED') {
      const targets = await repo.listTargets(db, actor.schoolId, homework.id);
      if (targets.length === 0) {
        throw new HomeworkDomainError('HOMEWORK_NOT_PUBLISHABLE', 'Homework requires at least one Class target.');
      }
      const classes = await repo.findClasses(db, actor.schoolId, targets.map((target) => target.classId));
      if (classes.length !== targets.length || classes.some((item) => item.status !== 'ACTIVE')) {
        throw new HomeworkDomainError('HOMEWORK_NOT_PUBLISHABLE', 'All Homework targets must remain active Classes.');
      }
    }
  }
  const row = await repo.updateHomework(db, actor.schoolId, id, input);
  if (!row) homeworkNotFound();
  return view(row);
}

export async function listHomeworkTargets(db: HomeworkDb, actor: HomeworkActor, homeworkId: string) {
  const homework = await repo.findHomework(db, actor.schoolId, homeworkId);
  if (!homework) homeworkNotFound();
  const current = await context(db, actor);
  if (current.role === 'PARENT') throw new ForbiddenError('Parents cannot inspect Homework target administration.');
  await authorizeHomework(db, actor, homework, 'manage');
  return (await repo.listTargets(db, actor.schoolId, homework.id)).map(view);
}

export async function addHomeworkTargets(
  db: HomeworkDb,
  actor: HomeworkActor,
  homeworkId: string,
  input: HomeworkTargetsCreateInput,
) {
  const homework = await repo.findHomework(db, actor.schoolId, homeworkId);
  if (!homework) homeworkNotFound();
  await authorizeHomework(db, actor, homework, 'manage');
  if (homework.status !== 'DRAFT') {
    throw new HomeworkDomainError('HOMEWORK_NOT_EDITABLE', 'Homework targets freeze after publication.');
  }
  const classes = await repo.findClasses(db, actor.schoolId, input.classIds);
  if (classes.length !== input.classIds.length
    || classes.some((item) => item.status !== 'ACTIVE' || item.academicYearId !== homework.academicYearId)) {
    throw new HomeworkDomainError('INVALID_HOMEWORK_CONTEXT', 'Every target must be an active same-year Class.');
  }
  const current = await context(db, actor);
  if (current.role === 'TEACHER') {
    const assignments = await teacherAssignments(db, actor);
    if (classes.some((item) => !assignmentMatches(assignments, homework, item.id))) {
      throw new ForbiddenError('A target Class is outside the Teacher assignment scope.');
    }
  }
  try {
    const rows = await repo.insertTargets(db, classes.map((item) => ({
      schoolId: actor.schoolId,
      homeworkId: homework.id,
      targetType: 'CLASS' as const,
      academicYearId: homework.academicYearId,
      classId: item.id,
    })));
    return rows.map(view);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HomeworkDomainError('DUPLICATE_HOMEWORK_TARGET', 'A Class is already targeted by this Homework.');
    }
    throw error;
  }
}

async function authorizeSubmissionManagement(
  db: HomeworkDb,
  actor: HomeworkActor,
  homework: NonNullable<Awaited<ReturnType<typeof repo.findHomework>>>,
  studentId: string,
) {
  const role = await authorizeHomework(db, actor, homework, 'manage');
  if (role !== 'TEACHER') return;
  const classes = await repo.eligibleTargetClassIds(db, {
    schoolId: actor.schoolId, homeworkId: homework.id, studentId, dueDate: homework.dueDate,
  });
  const assignments = await teacherAssignments(db, actor);
  if (!classes.some((item) => assignmentMatches(assignments, homework, item.classId))) {
    throw new ForbiddenError('Submission is outside the Teacher assignment scope.');
  }
}

function schoolDate(now: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

async function derivedSubmissionState(db: HomeworkDb, schoolId: string, dueDate: string, now: Date) {
  const timezone = await repo.findSchoolTimezone(db, schoolId);
  return schoolDate(now, timezone) > dueDate ? 'LATE' as const : 'SUBMITTED' as const;
}

export async function createHomeworkSubmission(
  db: HomeworkDb,
  actor: HomeworkActor,
  homeworkId: string,
  input: HomeworkSubmissionCreateInput,
) {
  const homework = await repo.findHomework(db, actor.schoolId, homeworkId);
  if (!homework) homeworkNotFound();
  if (homework.status !== 'PUBLISHED') {
    throw new HomeworkDomainError('HOMEWORK_SUBMISSION_NOT_ALLOWED', 'Only published Homework accepts new Submissions.');
  }
  const classes = await repo.eligibleTargetClassIds(db, {
    schoolId: actor.schoolId, homeworkId, studentId: input.studentId, dueDate: homework.dueDate,
  });
  if (classes.length === 0) {
    throw new HomeworkDomainError(
      'STUDENT_NOT_ELIGIBLE_FOR_HOMEWORK',
      'Student was not enrolled in a target Class on the Homework due date.',
    );
  }
  await authorizeSubmissionManagement(db, actor, homework, input.studentId);
  const now = new Date();
  try {
    const row = await repo.insertSubmission(db, {
      schoolId: actor.schoolId,
      homeworkId,
      studentId: input.studentId,
      content: input.content ?? null,
      submittedAt: now,
      status: await derivedSubmissionState(db, actor.schoolId, homework.dueDate, now),
    });
    return view(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HomeworkDomainError(
        'DUPLICATE_HOMEWORK_SUBMISSION',
        'A Submission already exists for this Homework and Student.',
      );
    }
    throw error;
  }
}

export async function listHomeworkSubmissions(
  db: HomeworkDb,
  actor: HomeworkActor,
  homeworkId: string,
  input: SubmissionListInput,
) {
  const homework = await repo.findHomework(db, actor.schoolId, homeworkId);
  if (!homework) homeworkNotFound();
  const role = await authorizeHomework(db, actor, homework, 'read');
  if (role === 'TEACHER') await authorizeHomework(db, actor, homework, 'manage');
  const result = await repo.listSubmissions(
    db, actor.schoolId, homeworkId, paging(input), input,
    role === 'PARENT' && actor.userId ? { userId: actor.userId, dueDate: homework.dueDate } : undefined,
  );
  return {
    data: result.rows.map(view),
    meta: { page: input.page, pageSize: input.pageSize, total: result.total },
  };
}

async function submissionContext(db: HomeworkDb, actor: HomeworkActor, id: string) {
  const submission = await repo.findSubmission(db, actor.schoolId, id);
  if (!submission) submissionNotFound();
  const homework = await repo.findHomework(db, actor.schoolId, submission.homeworkId);
  if (!homework) submissionNotFound();
  return { submission, homework };
}

export async function getHomeworkSubmission(db: HomeworkDb, actor: HomeworkActor, id: string) {
  const value = await submissionContext(db, actor, id);
  const current = await context(db, actor);
  if (current.role === 'PARENT') {
    await authorizeHomework(db, actor, value.homework, 'read');
    if (!actor.userId || !await repo.findParentEligibleStudent(db, {
      schoolId: actor.schoolId, userId: actor.userId, homeworkId: value.homework.id,
      dueDate: value.homework.dueDate, studentId: value.submission.studentId,
    })) throw new ForbiddenError('Submission is outside the Parent scope.');
  } else {
    await authorizeSubmissionManagement(db, actor, value.homework, value.submission.studentId);
  }
  return view(value.submission);
}

export async function patchHomeworkSubmission(
  db: HomeworkDb,
  actor: HomeworkActor,
  id: string,
  input: HomeworkSubmissionPatchInput,
) {
  const value = await submissionContext(db, actor, id);
  await authorizeSubmissionManagement(db, actor, value.homework, value.submission.studentId);
  if (value.homework.status !== 'PUBLISHED' || value.submission.status !== 'RETURNED') {
    throw new HomeworkDomainError(
      'INVALID_HOMEWORK_SUBMISSION_STATE',
      'Only a returned Submission on published Homework may be resubmitted.',
    );
  }
  const now = new Date();
  const row = await repo.updateSubmission(db, actor.schoolId, id, {
    content: input.content,
    submittedAt: now,
    status: await derivedSubmissionState(db, actor.schoolId, value.homework.dueDate, now),
  });
  if (!row) submissionNotFound();
  return view(row);
}

export async function reviewHomeworkSubmission(
  db: HomeworkDb,
  actor: HomeworkActor,
  id: string,
  input: HomeworkSubmissionReviewInput,
) {
  const value = await submissionContext(db, actor, id);
  await authorizeSubmissionManagement(db, actor, value.homework, value.submission.studentId);
  if (value.homework.status === 'ARCHIVED') {
    throw new HomeworkDomainError('HOMEWORK_SUBMISSION_NOT_ALLOWED', 'Archived Homework is read-only.');
  }
  const valid = input.status === 'REVIEWED'
    ? value.submission.status === 'SUBMITTED' || value.submission.status === 'LATE'
    : value.submission.status === 'REVIEWED';
  if (!valid) {
    throw new HomeworkDomainError('INVALID_HOMEWORK_SUBMISSION_STATE', 'Submission state transition is invalid.');
  }
  const row = await repo.updateSubmission(db, actor.schoolId, id, { status: input.status });
  if (!row) submissionNotFound();
  return view(row);
}

export async function listHomeworkStudents(
  db: HomeworkDb,
  actor: HomeworkActor,
  homeworkId: string,
  input: PageInput,
) {
  const homework = await repo.findHomework(db, actor.schoolId, homeworkId);
  if (!homework) homeworkNotFound();
  const role = await authorizeHomework(db, actor, homework, 'read');
  if (role === 'PARENT') throw new ForbiddenError('Parents cannot inspect the Homework roster.');
  if (role === 'TEACHER') await authorizeHomework(db, actor, homework, 'manage');
  const result = await repo.listEligibleStudents(db, {
    schoolId: actor.schoolId, homeworkId, dueDate: homework.dueDate,
  }, paging(input));
  return {
    data: result.rows.map((row) => ({
      student: {
        id: row.studentId,
        firstName: row.firstName,
        lastName: row.lastName,
        studentCode: row.studentCode,
        status: row.studentStatus,
      },
      submission: row.submissionId === null ? null : {
        id: row.submissionId,
        submittedAt: row.submittedAt,
        content: row.content,
        status: row.submissionStatus,
        updatedAt: row.submissionUpdatedAt,
      },
    })),
    meta: { page: input.page, pageSize: input.pageSize, total: result.total },
  };
}
