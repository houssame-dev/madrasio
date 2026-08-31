import { createClient } from '@supabase/supabase-js';
import * as schema from '@school/database';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type {
  AuthAdminPort,
  AuthIdentity,
  BootstrapConfig,
  BootstrapDbState,
  BootstrapStorePort,
  DemoSeedStorePort,
  SeedDbState,
} from './contracts';
import { OperatorError } from './contracts';

type Db = NodePgDatabase<typeof schema>;

export const DEMO_IDS = {
  academicYear: 'c0420000-0000-4000-8000-000000000001',
  periodOne: 'c0420000-0000-4000-8000-000000000002',
  periodTwo: 'c0420000-0000-4000-8000-000000000003',
  stage: 'c0420000-0000-4000-8000-000000000004',
  level: 'c0420000-0000-4000-8000-000000000005',
  subjectMath: 'c0420000-0000-4000-8000-000000000006',
  subjectFrench: 'c0420000-0000-4000-8000-000000000007',
  curriculum: 'c0420000-0000-4000-8000-000000000008',
  curriculumVersion: 'c0420000-0000-4000-8000-000000000009',
  curriculumSubjectMath: 'c0420000-0000-4000-8000-00000000000a',
  curriculumSubjectFrench: 'c0420000-0000-4000-8000-00000000000b',
  class: 'c0420000-0000-4000-8000-00000000000c',
  studentOne: 'c0420000-0000-4000-8000-00000000000d',
  studentTwo: 'c0420000-0000-4000-8000-00000000000e',
  enrollmentOne: 'c0420000-0000-4000-8000-00000000000f',
  enrollmentTwo: 'c0420000-0000-4000-8000-000000000010',
  teacher: 'c0420000-0000-4000-8000-000000000011',
  assignment: 'c0420000-0000-4000-8000-000000000012',
  parent: 'c0420000-0000-4000-8000-000000000013',
  relationship: 'c0420000-0000-4000-8000-000000000014',
  gradingConfiguration: 'c0420000-0000-4000-8000-000000000015',
  gradingVersion: 'c0420000-0000-4000-8000-000000000016',
  teacherMembership: 'c0420000-0000-4000-8000-000000000017',
  parentMembership: 'c0420000-0000-4000-8000-000000000018',
} as const;

class SupabaseAuthAdmin implements AuthAdminPort {
  private readonly client;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }

  async listUsers(): Promise<AuthIdentity[]> {
    const identities: AuthIdentity[] = [];
    for (let page = 1; ; page += 1) {
      const result = await this.client.auth.admin.listUsers({ page, perPage: 1000 });
      if (result.error)
        throw new OperatorError('AUTH_ADMIN_FAILED', 'Auth Admin user inspection failed.');
      for (const user of result.data.users) {
        if (user.email) identities.push({ id: user.id, email: user.email });
      }
      if (result.data.users.length < 1000) return identities;
    }
  }

  async createUser(input: { email: string; password: string }): Promise<AuthIdentity> {
    const result = await this.client.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    if (result.error || !result.data.user.email) {
      throw new OperatorError('AUTH_ADMIN_FAILED', 'Auth Admin identity creation failed.');
    }
    return { id: result.data.user.id, email: result.data.user.email };
  }

  async deleteUser(id: string): Promise<void> {
    const result = await this.client.auth.admin.deleteUser(id);
    if (result.error)
      throw new OperatorError('AUTH_ADMIN_FAILED', 'Auth Admin compensation failed.');
  }
}

class BootstrapStore implements BootstrapStorePort {
  constructor(private readonly db: Db) {}

  async inspect(
    authUserId: string | null,
    input: { schoolName: string; timezone: string },
  ): Promise<BootstrapDbState> {
    const [userCount, schoolCount, membershipCount] = await Promise.all([
      this.db.select({ value: sql<number>`count(*)::int` }).from(schema.users),
      this.db.select({ value: sql<number>`count(*)::int` }).from(schema.schools),
      this.db.select({ value: sql<number>`count(*)::int` }).from(schema.schoolMemberships),
    ]);
    const coreCount = userCount[0].value + schoolCount[0].value + membershipCount[0].value;
    if (!authUserId) {
      return coreCount === 0
        ? { kind: 'empty' }
        : {
            kind: 'partial',
            reason: 'Application identity or tenant rows exist without the intended Auth identity.',
          };
    }
    const rows = await this.db
      .select({
        userStatus: schema.users.status,
        schoolId: schema.schools.id,
        schoolName: schema.schools.name,
        schoolStatus: schema.schools.status,
        timezone: schema.schools.timezone,
        role: schema.schoolMemberships.role,
        membershipStatus: schema.schoolMemberships.status,
      })
      .from(schema.users)
      .innerJoin(schema.schoolMemberships, eq(schema.schoolMemberships.userId, schema.users.id))
      .innerJoin(schema.schools, eq(schema.schools.id, schema.schoolMemberships.schoolId))
      .where(eq(schema.users.id, authUserId));
    if (
      rows.length === 1 &&
      rows[0].userStatus === 'ACTIVE' &&
      rows[0].role === 'SCHOOL_ADMIN' &&
      rows[0].membershipStatus === 'ACTIVE' &&
      rows[0].schoolName === input.schoolName &&
      rows[0].schoolStatus === 'ACTIVE' &&
      rows[0].timezone === input.timezone
    ) {
      return { kind: 'complete', schoolId: rows[0].schoolId };
    }
    return {
      kind: 'partial',
      reason:
        'The intended Auth identity is not linked to one exact active SchoolAdmin tenant state.',
    };
  }

  async create(input: { authUserId: string; schoolName: string; timezone: string }) {
    return this.db.transaction(async (tx) => {
      await tx.insert(schema.users).values({ id: input.authUserId, status: 'ACTIVE' });
      const [school] = await tx
        .insert(schema.schools)
        .values({
          name: input.schoolName,
          timezone: input.timezone,
          status: 'ACTIVE',
        })
        .returning({ id: schema.schools.id });
      await tx.insert(schema.schoolMemberships).values({
        schoolId: school.id,
        userId: input.authUserId,
        role: 'SCHOOL_ADMIN',
        status: 'ACTIVE',
      });
      return { schoolId: school.id };
    });
  }
}

class DemoSeedStore implements DemoSeedStorePort {
  constructor(private readonly db: Db) {}

  async inspect(input: {
    adminUserId: string | null;
    teacherUserId: string | null;
    parentUserId: string | null;
    schoolName: string;
  }): Promise<SeedDbState> {
    if (!input.adminUserId)
      return { kind: 'partial', reason: 'The intended bootstrap admin Auth identity is missing.' };
    const adminRows = await this.db
      .select({ schoolId: schema.schools.id })
      .from(schema.schoolMemberships)
      .innerJoin(schema.schools, eq(schema.schools.id, schema.schoolMemberships.schoolId))
      .where(
        and(
          eq(schema.schoolMemberships.userId, input.adminUserId),
          eq(schema.schoolMemberships.role, 'SCHOOL_ADMIN'),
          eq(schema.schoolMemberships.status, 'ACTIVE'),
          eq(schema.schools.name, input.schoolName),
          eq(schema.schools.status, 'ACTIVE'),
        ),
      );
    if (adminRows.length !== 1)
      return {
        kind: 'partial',
        reason: 'The exact bootstrapped SchoolAdmin tenant was not found.',
      };
    const schoolId = adminRows[0].schoolId;

    const fixedChecks = await Promise.all([
      this.db
        .select({ id: schema.academicYears.id })
        .from(schema.academicYears)
        .where(eq(schema.academicYears.id, DEMO_IDS.academicYear)),
      this.db
        .select({ id: schema.academicPeriods.id })
        .from(schema.academicPeriods)
        .where(inArray(schema.academicPeriods.id, [DEMO_IDS.periodOne, DEMO_IDS.periodTwo])),
      this.db
        .select({ id: schema.stages.id })
        .from(schema.stages)
        .where(eq(schema.stages.id, DEMO_IDS.stage)),
      this.db
        .select({ id: schema.levels.id })
        .from(schema.levels)
        .where(eq(schema.levels.id, DEMO_IDS.level)),
      this.db
        .select({ id: schema.subjects.id })
        .from(schema.subjects)
        .where(inArray(schema.subjects.id, [DEMO_IDS.subjectMath, DEMO_IDS.subjectFrench])),
      this.db
        .select({ id: schema.curricula.id })
        .from(schema.curricula)
        .where(eq(schema.curricula.id, DEMO_IDS.curriculum)),
      this.db
        .select({ id: schema.curriculumVersions.id })
        .from(schema.curriculumVersions)
        .where(eq(schema.curriculumVersions.id, DEMO_IDS.curriculumVersion)),
      this.db
        .select({ id: schema.curriculumSubjects.id })
        .from(schema.curriculumSubjects)
        .where(
          inArray(schema.curriculumSubjects.id, [
            DEMO_IDS.curriculumSubjectMath,
            DEMO_IDS.curriculumSubjectFrench,
          ]),
        ),
      this.db
        .select({ id: schema.classes.id })
        .from(schema.classes)
        .where(eq(schema.classes.id, DEMO_IDS.class)),
      this.db
        .select({ id: schema.students.id })
        .from(schema.students)
        .where(inArray(schema.students.id, [DEMO_IDS.studentOne, DEMO_IDS.studentTwo])),
      this.db
        .select({ id: schema.studentEnrollments.id })
        .from(schema.studentEnrollments)
        .where(
          inArray(schema.studentEnrollments.id, [DEMO_IDS.enrollmentOne, DEMO_IDS.enrollmentTwo]),
        ),
      this.db
        .select({ id: schema.teachers.id })
        .from(schema.teachers)
        .where(eq(schema.teachers.id, DEMO_IDS.teacher)),
      this.db
        .select({ id: schema.teacherAssignments.id })
        .from(schema.teacherAssignments)
        .where(eq(schema.teacherAssignments.id, DEMO_IDS.assignment)),
      this.db
        .select({ id: schema.parents.id })
        .from(schema.parents)
        .where(eq(schema.parents.id, DEMO_IDS.parent)),
      this.db
        .select({ id: schema.parentStudents.id })
        .from(schema.parentStudents)
        .where(eq(schema.parentStudents.id, DEMO_IDS.relationship)),
      this.db
        .select({ id: schema.gradingConfigurations.id })
        .from(schema.gradingConfigurations)
        .where(eq(schema.gradingConfigurations.id, DEMO_IDS.gradingConfiguration)),
      this.db
        .select({ id: schema.gradingConfigurationVersions.id })
        .from(schema.gradingConfigurationVersions)
        .where(eq(schema.gradingConfigurationVersions.id, DEMO_IDS.gradingVersion)),
    ]);
    const present = fixedChecks.reduce((total, rows) => total + rows.length, 0);
    const expected = 22;
    const existingDomain = await this.db.execute(sql`
      select (
        (select count(*) from academic_years where school_id = ${schoolId})
        + (select count(*) from academic_periods where school_id = ${schoolId})
        + (select count(*) from stages where school_id = ${schoolId})
        + (select count(*) from levels where school_id = ${schoolId})
        + (select count(*) from tracks where school_id = ${schoolId})
        + (select count(*) from subjects where school_id = ${schoolId})
        + (select count(*) from curricula where school_id = ${schoolId})
        + (select count(*) from curriculum_versions where school_id = ${schoolId})
        + (select count(*) from curriculum_subjects where school_id = ${schoolId})
        + (select count(*) from classes where school_id = ${schoolId})
        + (select count(*) from students where school_id = ${schoolId})
        + (select count(*) from student_enrollments where school_id = ${schoolId})
        + (select count(*) from teachers where school_id = ${schoolId})
        + (select count(*) from teacher_assignments where school_id = ${schoolId})
        + (select count(*) from parents where school_id = ${schoolId})
        + (select count(*) from parent_students where school_id = ${schoolId})
        + (select count(*) from grading_configurations where school_id = ${schoolId})
        + (select count(*) from grading_configuration_versions where school_id = ${schoolId})
        + (select count(*) from school_memberships where school_id = ${schoolId} and role in ('TEACHER', 'PARENT'))
      )::int as count
    `);
    const existingDomainCount = (existingDomain.rows[0] as { count: number }).count;
    if (present === 0 && existingDomainCount === 0 && !input.teacherUserId && !input.parentUserId) {
      return { kind: 'empty', schoolId };
    }
    if (present !== expected || !input.teacherUserId || !input.parentUserId) {
      return {
        kind: 'partial',
        reason: 'Only part of the deterministic Task 042 fixture set exists.',
      };
    }

    const [teacherLink, parentLink, academicLink, enrollmentLinks, gradingLink] = await Promise.all(
      [
        this.db
          .select({ teacherId: schema.teachers.id })
          .from(schema.teachers)
          .innerJoin(schema.users, eq(schema.users.id, schema.teachers.userId))
          .innerJoin(
            schema.schoolMemberships,
            and(
              eq(schema.schoolMemberships.userId, schema.users.id),
              eq(schema.schoolMemberships.schoolId, schema.teachers.schoolId),
            ),
          )
          .innerJoin(
            schema.teacherAssignments,
            eq(schema.teacherAssignments.teacherId, schema.teachers.id),
          )
          .where(
            and(
              eq(schema.teachers.id, DEMO_IDS.teacher),
              eq(schema.teachers.schoolId, schoolId),
              eq(schema.teachers.userId, input.teacherUserId),
              eq(schema.schoolMemberships.role, 'TEACHER'),
              eq(schema.schoolMemberships.status, 'ACTIVE'),
              eq(schema.teacherAssignments.id, DEMO_IDS.assignment),
            ),
          ),
        this.db
          .select({ parentId: schema.parents.id })
          .from(schema.parents)
          .innerJoin(schema.users, eq(schema.users.id, schema.parents.userId))
          .innerJoin(
            schema.schoolMemberships,
            and(
              eq(schema.schoolMemberships.userId, schema.users.id),
              eq(schema.schoolMemberships.schoolId, schema.parents.schoolId),
            ),
          )
          .innerJoin(schema.parentStudents, eq(schema.parentStudents.parentId, schema.parents.id))
          .where(
            and(
              eq(schema.parents.id, DEMO_IDS.parent),
              eq(schema.parents.schoolId, schoolId),
              eq(schema.parents.userId, input.parentUserId),
              eq(schema.schoolMemberships.role, 'PARENT'),
              eq(schema.schoolMemberships.status, 'ACTIVE'),
              eq(schema.parentStudents.studentId, DEMO_IDS.studentOne),
              eq(schema.parentStudents.status, 'ACTIVE'),
            ),
          ),
        this.db
          .select({ classId: schema.classes.id })
          .from(schema.classes)
          .innerJoin(
            schema.academicYears,
            and(
              eq(schema.academicYears.id, schema.classes.academicYearId),
              eq(schema.academicYears.schoolId, schema.classes.schoolId),
            ),
          )
          .innerJoin(
            schema.levels,
            and(
              eq(schema.levels.id, schema.classes.levelId),
              eq(schema.levels.schoolId, schema.classes.schoolId),
            ),
          )
          .innerJoin(
            schema.stages,
            and(
              eq(schema.stages.id, schema.levels.stageId),
              eq(schema.stages.schoolId, schema.levels.schoolId),
            ),
          )
          .innerJoin(
            schema.curriculumVersions,
            and(
              eq(schema.curriculumVersions.id, schema.classes.curriculumVersionId),
              eq(schema.curriculumVersions.schoolId, schema.classes.schoolId),
            ),
          )
          .where(
            and(
              eq(schema.classes.id, DEMO_IDS.class),
              eq(schema.classes.schoolId, schoolId),
              eq(schema.academicYears.id, DEMO_IDS.academicYear),
              eq(schema.levels.id, DEMO_IDS.level),
              eq(schema.stages.id, DEMO_IDS.stage),
              eq(schema.curriculumVersions.id, DEMO_IDS.curriculumVersion),
              eq(schema.classes.status, 'ACTIVE'),
            ),
          ),
        this.db
          .select({ enrollmentId: schema.studentEnrollments.id })
          .from(schema.studentEnrollments)
          .where(
            and(
              eq(schema.studentEnrollments.schoolId, schoolId),
              inArray(schema.studentEnrollments.id, [
                DEMO_IDS.enrollmentOne,
                DEMO_IDS.enrollmentTwo,
              ]),
              eq(schema.studentEnrollments.academicYearId, DEMO_IDS.academicYear),
              eq(schema.studentEnrollments.classId, DEMO_IDS.class),
              eq(schema.studentEnrollments.status, 'ACTIVE'),
            ),
          ),
        this.db
          .select({ versionId: schema.gradingConfigurationVersions.id })
          .from(schema.gradingConfigurationVersions)
          .innerJoin(
            schema.gradingConfigurations,
            and(
              eq(
                schema.gradingConfigurations.id,
                schema.gradingConfigurationVersions.gradingConfigurationId,
              ),
              eq(
                schema.gradingConfigurations.schoolId,
                schema.gradingConfigurationVersions.schoolId,
              ),
            ),
          )
          .where(
            and(
              eq(schema.gradingConfigurationVersions.id, DEMO_IDS.gradingVersion),
              eq(schema.gradingConfigurationVersions.schoolId, schoolId),
              eq(schema.gradingConfigurationVersions.status, 'ACTIVE'),
              eq(schema.gradingConfigurations.id, DEMO_IDS.gradingConfiguration),
              eq(schema.gradingConfigurations.status, 'ACTIVE'),
            ),
          ),
      ],
    );
    return teacherLink.length === 1 &&
      parentLink.length === 1 &&
      academicLink.length === 1 &&
      enrollmentLinks.length === 2 &&
      gradingLink.length === 1
      ? { kind: 'complete', schoolId }
      : {
          kind: 'partial',
          reason:
            'Deterministic rows exist but their Auth, membership, assignment, or relationship links differ.',
        };
  }

  async create(input: {
    schoolId: string;
    teacherUserId: string;
    parentUserId: string;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.users).values([
        { id: input.teacherUserId, status: 'ACTIVE' },
        { id: input.parentUserId, status: 'ACTIVE' },
      ]);
      await tx.insert(schema.schoolMemberships).values([
        {
          id: DEMO_IDS.teacherMembership,
          schoolId: input.schoolId,
          userId: input.teacherUserId,
          role: 'TEACHER',
          status: 'ACTIVE',
        },
        {
          id: DEMO_IDS.parentMembership,
          schoolId: input.schoolId,
          userId: input.parentUserId,
          role: 'PARENT',
          status: 'ACTIVE',
        },
      ]);
      await tx
        .insert(schema.academicYears)
        .values({
          id: DEMO_IDS.academicYear,
          schoolId: input.schoolId,
          name: 'STAGING 2026/2027',
          startDate: '2026-09-01',
          endDate: '2027-06-30',
          status: 'ACTIVE',
        });
      await tx.insert(schema.academicPeriods).values([
        {
          id: DEMO_IDS.periodOne,
          schoolId: input.schoolId,
          academicYearId: DEMO_IDS.academicYear,
          name: 'STAGING Term 1',
          sequence: 1,
          startDate: '2026-09-01',
          endDate: '2027-01-31',
          status: 'ACTIVE',
        },
        {
          id: DEMO_IDS.periodTwo,
          schoolId: input.schoolId,
          academicYearId: DEMO_IDS.academicYear,
          name: 'STAGING Term 2',
          sequence: 2,
          startDate: '2027-02-01',
          endDate: '2027-06-30',
          status: 'PLANNED',
        },
      ]);
      await tx
        .insert(schema.stages)
        .values({
          id: DEMO_IDS.stage,
          schoolId: input.schoolId,
          name: 'STAGING Primary',
          sequence: 1,
          status: 'ACTIVE',
        });
      await tx
        .insert(schema.levels)
        .values({
          id: DEMO_IDS.level,
          schoolId: input.schoolId,
          stageId: DEMO_IDS.stage,
          name: 'STAGING Level 5',
          sequence: 1,
          status: 'ACTIVE',
        });
      await tx.insert(schema.subjects).values([
        {
          id: DEMO_IDS.subjectMath,
          schoolId: input.schoolId,
          name: 'STAGING Mathematics',
          code: 'STG-MATH',
          status: 'ACTIVE',
        },
        {
          id: DEMO_IDS.subjectFrench,
          schoolId: input.schoolId,
          name: 'STAGING French',
          code: 'STG-FR',
          status: 'ACTIVE',
        },
      ]);
      await tx
        .insert(schema.curricula)
        .values({
          id: DEMO_IDS.curriculum,
          schoolId: input.schoolId,
          name: 'STAGING Primary Curriculum',
          status: 'ACTIVE',
        });
      await tx
        .insert(schema.curriculumVersions)
        .values({
          id: DEMO_IDS.curriculumVersion,
          schoolId: input.schoolId,
          curriculumId: DEMO_IDS.curriculum,
          name: 'STAGING v1',
          status: 'DRAFT',
        });
      await tx.insert(schema.curriculumSubjects).values([
        {
          id: DEMO_IDS.curriculumSubjectMath,
          schoolId: input.schoolId,
          curriculumVersionId: DEMO_IDS.curriculumVersion,
          subjectId: DEMO_IDS.subjectMath,
          coefficient: '2.00',
          displayOrder: 1,
          status: 'ACTIVE',
        },
        {
          id: DEMO_IDS.curriculumSubjectFrench,
          schoolId: input.schoolId,
          curriculumVersionId: DEMO_IDS.curriculumVersion,
          subjectId: DEMO_IDS.subjectFrench,
          coefficient: '1.00',
          displayOrder: 2,
          status: 'ACTIVE',
        },
      ]);
      await tx
        .update(schema.curriculumVersions)
        .set({ status: 'ACTIVE', updatedAt: new Date() })
        .where(eq(schema.curriculumVersions.id, DEMO_IDS.curriculumVersion));
      await tx
        .insert(schema.classes)
        .values({
          id: DEMO_IDS.class,
          schoolId: input.schoolId,
          academicYearId: DEMO_IDS.academicYear,
          levelId: DEMO_IDS.level,
          curriculumVersionId: DEMO_IDS.curriculumVersion,
          name: 'STAGING 5A',
          status: 'ACTIVE',
        });
      await tx.insert(schema.students).values([
        {
          id: DEMO_IDS.studentOne,
          schoolId: input.schoolId,
          firstName: 'Staging',
          lastName: 'Learner One',
          studentCode: 'STG-STU-001',
          status: 'ACTIVE',
        },
        {
          id: DEMO_IDS.studentTwo,
          schoolId: input.schoolId,
          firstName: 'Staging',
          lastName: 'Learner Two',
          studentCode: 'STG-STU-002',
          status: 'ACTIVE',
        },
      ]);
      await tx.insert(schema.studentEnrollments).values([
        {
          id: DEMO_IDS.enrollmentOne,
          schoolId: input.schoolId,
          studentId: DEMO_IDS.studentOne,
          academicYearId: DEMO_IDS.academicYear,
          classId: DEMO_IDS.class,
          effectiveFrom: '2026-09-01',
          status: 'ACTIVE',
        },
        {
          id: DEMO_IDS.enrollmentTwo,
          schoolId: input.schoolId,
          studentId: DEMO_IDS.studentTwo,
          academicYearId: DEMO_IDS.academicYear,
          classId: DEMO_IDS.class,
          effectiveFrom: '2026-09-01',
          status: 'ACTIVE',
        },
      ]);
      await tx
        .insert(schema.teachers)
        .values({
          id: DEMO_IDS.teacher,
          schoolId: input.schoolId,
          userId: input.teacherUserId,
          firstName: 'Staging',
          lastName: 'Teacher',
          teacherCode: 'STG-TCH-001',
          status: 'ACTIVE',
        });
      await tx
        .insert(schema.teacherAssignments)
        .values({
          id: DEMO_IDS.assignment,
          schoolId: input.schoolId,
          teacherId: DEMO_IDS.teacher,
          classId: DEMO_IDS.class,
          subjectId: DEMO_IDS.subjectMath,
          academicYearId: DEMO_IDS.academicYear,
          effectiveFrom: '2026-09-01',
          status: 'ACTIVE',
        });
      await tx
        .insert(schema.parents)
        .values({
          id: DEMO_IDS.parent,
          schoolId: input.schoolId,
          userId: input.parentUserId,
          firstName: 'Staging',
          lastName: 'Parent',
          parentCode: 'STG-PAR-001',
          status: 'ACTIVE',
        });
      await tx
        .insert(schema.parentStudents)
        .values({
          id: DEMO_IDS.relationship,
          schoolId: input.schoolId,
          parentId: DEMO_IDS.parent,
          studentId: DEMO_IDS.studentOne,
          status: 'ACTIVE',
        });
      await tx
        .insert(schema.gradingConfigurations)
        .values({
          id: DEMO_IDS.gradingConfiguration,
          schoolId: input.schoolId,
          name: 'STAGING Standard Grading',
          status: 'ACTIVE',
        });
      await tx.insert(schema.gradingConfigurationVersions).values({
        id: DEMO_IDS.gradingVersion,
        schoolId: input.schoolId,
        gradingConfigurationId: DEMO_IDS.gradingConfiguration,
        versionNumber: 1,
        status: 'ACTIVE',
        rules: {
          schemaVersion: 1,
          periodCalculation: { mode: 'WEIGHTED_AVERAGE' },
          annualCalculation: { mode: 'WEIGHTED_AVERAGE' },
          assessmentWeighting: { mode: 'WEIGHTED' },
          coefficientUsage: { mode: 'USE_CURRICULUM_SUBJECT_COEFFICIENT' },
          rounding: { mode: 'HALF_UP', scale: 2 },
          thresholds: { maxScore: 20, passingScore: 10 },
        },
      });
    });
  }
}

function responseSaysInvalidApiKey(body: string): boolean {
  const normalized = body.toLowerCase();
  return normalized.includes('invalid api key') || normalized.includes('invalid api-key');
}

export async function verifyHostedHttpPreflight(
  config: BootstrapConfig,
  request: typeof fetch = fetch,
): Promise<void> {
  const headers = { apikey: config.SUPABASE_ANON_KEY };
  const authSettings = await request(`${config.SUPABASE_URL}/auth/v1/settings`, { headers });
  const authBody = await authSettings.text();
  if (responseSaysInvalidApiKey(authBody)) {
    throw new OperatorError(
      'STAGING_PUBLIC_KEY_MISMATCH',
      'The configured public Supabase credential was rejected by STAGING Auth.',
    );
  }
  if (!authSettings.ok) {
    throw new OperatorError(
      'STAGING_PUBLIC_KEY_MISMATCH',
      'The configured public Supabase credential could not be validated against STAGING Auth.',
    );
  }
  const settings = JSON.parse(authBody) as {
    disable_signup?: boolean;
    external?: { anonymous?: boolean };
  };
  if (settings.disable_signup !== true || settings.external?.anonymous === true) {
    throw new OperatorError(
      'HOSTED_PREFLIGHT_FAILED',
      'Public or anonymous signup is not safely disabled.',
    );
  }

  // Dashboard/management confirmation that Enable Data API is OFF is the
  // authoritative configuration checkpoint. This is a separate runtime
  // negative check against a normal application table; gateway/PostgREST
  // failure statuses are deliberately not treated as a stable contract.
  const tableResponse = await request(
    `${config.SUPABASE_URL}/rest/v1/schools?select=id&limit=1`,
    {
      headers: {
        ...headers,
        Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
      },
    },
  );
  const tableBody = await tableResponse.text();
  if (responseSaysInvalidApiKey(tableBody)) {
    throw new OperatorError(
      'STAGING_PUBLIC_KEY_MISMATCH',
      'The configured public Supabase credential was rejected by the STAGING gateway.',
    );
  }
  if (tableResponse.ok) {
    throw new OperatorError(
      'DATA_API_UNEXPECTEDLY_AVAILABLE',
      'An application table was queryable through the Data API.',
    );
  }
}

export async function runHostedPreflight(config: BootstrapConfig, db: Db): Promise<void> {
  const metadata = await db.execute(sql`
    select
      current_database() as database,
      to_regclass('auth.users')::text as auth_users,
      (select count(*)::int from drizzle.__drizzle_migrations) as migration_count,
      (select count(*)::int from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') as public_table_count
  `);
  const row = metadata.rows[0] as Record<string, unknown> | undefined;
  if (
    !row ||
    row.database !== 'postgres' ||
    row.auth_users !== 'auth.users' ||
    row.migration_count !== 14 ||
    row.public_table_count !== 39
  ) {
    throw new OperatorError(
      'HOSTED_PREFLIGHT_FAILED',
      'Hosted database metadata, Auth dependency, or migration journal is not the reviewed Task 041 state.',
    );
  }

  await verifyHostedHttpPreflight(config);
}

export function createOperatorRuntime(config: BootstrapConfig) {
  const pool = new Pool({ connectionString: config.MIGRATION_DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema });
  return {
    auth: new SupabaseAuthAdmin(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY),
    bootstrapStore: new BootstrapStore(db),
    demoSeedStore: new DemoSeedStore(db),
    preflight: () => runHostedPreflight(config, db),
    verifyPasswordLogin: async (email: string, password: string, expectedUserId: string) => {
      const client = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const result = await client.auth.signInWithPassword({ email, password });
      const matches = !result.error && result.data.user?.id === expectedUserId;
      await client.auth.signOut({ scope: 'local' });
      if (!matches)
        throw new OperatorError(
          'AUTH_LOGIN_VERIFICATION_FAILED',
          'Real password login verification failed.',
        );
    },
    close: () => pool.end(),
  };
}
