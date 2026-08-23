import type { Role } from '@/lib/authorization/roles';
import {
  requireOperation, resolveCurrentContext, type AuthorizationDb,
} from '@/lib/authorization/server';
import { ForbiddenError } from '@/lib/errors';

import type { AttendanceHistoryInput, BulkAttendance } from '../domain/contracts';
import * as repo from '../infrastructure/repositories/attendance-repository';
import type { AttendanceDb, AttendanceFilters } from '../infrastructure/repositories/attendance-repository';
import { AttendanceDomainError } from './attendance-errors';

export interface AttendanceActor { userId: string | null; schoolId: string }
export interface DailyRosterInput { page: number; pageSize: number }

function paging(input: { page: number; pageSize: number }) {
  return { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
}
function view<T extends { schoolId?: string }>(row: T): Omit<T, 'schoolId'> {
  const { schoolId: _schoolId, ...data } = row;
  return data;
}
function notFound(): never {
  throw new AttendanceDomainError('ATTENDANCE_NOT_FOUND', 'Attendance context was not found.');
}
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function currentRole(db: AttendanceDb, actor: AttendanceActor): Promise<Role> {
  await requireOperation(db as unknown as AuthorizationDb, actor, { scope: { kind: 'school' } });
  return (await resolveCurrentContext(db as unknown as AuthorizationDb, actor)).role as Role;
}

async function authorizeClass(
  db: AttendanceDb,
  actor: AttendanceActor,
  context: { classId: string; academicYearId: string },
  permission: 'attendance.read' | 'attendance.manage',
) {
  const role = await currentRole(db, actor);
  if (role === 'PARENT') throw new ForbiddenError('Parents cannot access raw Attendance administration APIs.');
  await requireOperation(db as unknown as AuthorizationDb, actor, role === 'TEACHER' ? {
    permission,
    scope: { kind: 'teacherClass', classId: context.classId, academicYearId: context.academicYearId },
  } : { permission, scope: { kind: 'school' } });
  return role;
}

function assertDate(date: string, academicYear: { startDate: string; endDate: string }) {
  if (date > todayUtc()) {
    throw new AttendanceDomainError('INVALID_ATTENDANCE_DATE', 'Attendance cannot be entered for a future date.');
  }
  if (date < academicYear.startDate || date > academicYear.endDate) {
    throw new AttendanceDomainError(
      'INVALID_ATTENDANCE_DATE',
      'Attendance date must fall within the Class AcademicYear.',
    );
  }
}

async function classContext(db: AttendanceDb, actor: AttendanceActor, classId: string) {
  const context = await repo.findClassContext(db, actor.schoolId, classId);
  if (!context) notFound();
  return context;
}

export async function putDailyAttendance(
  db: AttendanceDb,
  actor: AttendanceActor,
  classId: string,
  date: string,
  input: BulkAttendance,
) {
  const context = await classContext(db, actor, classId);
  await authorizeClass(db, actor, {
    classId: context.class.id, academicYearId: context.class.academicYearId,
  }, 'attendance.manage');
  assertDate(date, context.academicYear);

  const rows = await db.transaction(async (tx) => {
    const transactionDb = tx as unknown as AttendanceDb;
    const existingRows = await repo.findExistingStudentIds(
      transactionDb,
      actor.schoolId,
      context.class.id,
      date,
      input.records.map((record) => record.studentId),
    );
    const existingIds = new Set(existingRows.map((record) => record.studentId));
    if (context.class.status !== 'ACTIVE' && input.records.some((record) => !existingIds.has(record.studentId))) {
      throw new AttendanceDomainError(
        'ATTENDANCE_ENTRY_NOT_ALLOWED',
        'Closed or archived Classes allow corrections to existing Attendance only.',
      );
    }

    const written = [];
    for (const entry of input.records) {
      const eligible = await repo.findEligibleEnrollment(transactionDb, {
        schoolId: actor.schoolId,
        studentId: entry.studentId,
        classId: context.class.id,
        academicYearId: context.class.academicYearId,
        date,
      });
      if (!eligible) {
        throw new AttendanceDomainError(
          'STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE',
          'Student was not enrolled in the Class on the Attendance date.',
        );
      }
      written.push(await repo.upsertAttendance(transactionDb, {
        schoolId: actor.schoolId,
        studentId: entry.studentId,
        classId: context.class.id,
        academicYearId: context.class.academicYearId,
        attendanceDate: date,
        status: entry.status,
        note: entry.note ?? null,
      }));
    }
    return written;
  });
  return { records: rows.map(view) };
}

export async function getDailyAttendance(
  db: AttendanceDb,
  actor: AttendanceActor,
  classId: string,
  date: string,
  input: DailyRosterInput,
) {
  const context = await classContext(db, actor, classId);
  await authorizeClass(db, actor, {
    classId: context.class.id, academicYearId: context.class.academicYearId,
  }, 'attendance.read');
  assertDate(date, context.academicYear);
  const result = await repo.listDailyRoster(db, {
    schoolId: actor.schoolId,
    classId: context.class.id,
    academicYearId: context.class.academicYearId,
    date,
  }, paging(input));
  return {
    data: {
      class: view(context.class),
      attendanceDate: date,
      students: result.rows.map((row) => ({
        student: {
          id: row.studentId,
          firstName: row.firstName,
          lastName: row.lastName,
          studentCode: row.studentCode,
          status: row.studentStatus,
        },
        attendance: row.attendanceId === null ? null : {
          id: row.attendanceId,
          status: row.attendanceStatus,
          note: row.note,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      })),
    },
    meta: { page: input.page, pageSize: input.pageSize, total: result.total },
  };
}

export async function getStudentAttendanceHistory(
  db: AttendanceDb,
  actor: AttendanceActor,
  studentId: string,
  input: AttendanceHistoryInput,
) {
  const role = await currentRole(db, actor);
  if (role === 'PARENT') throw new ForbiddenError('Parents cannot access raw Attendance administration APIs.');
  await requireOperation(db as unknown as AuthorizationDb, actor, {
    permission: 'attendance.read', scope: { kind: 'school' },
  });
  if (!await repo.findStudent(db, actor.schoolId, studentId)) notFound();
  const filters: AttendanceFilters = input;
  const result = await repo.listStudentHistory(
    db,
    actor.schoolId,
    studentId,
    paging(input),
    filters,
    role === 'TEACHER' ? actor.userId ?? undefined : undefined,
  );
  return {
    data: result.rows.map(view),
    meta: { page: input.page, pageSize: input.pageSize, total: result.total },
  };
}
