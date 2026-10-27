// @vitest-environment node
import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as schema from '@school/database';
import { applicationSecurityAuditSql } from '@school/database/security';
import { deliveryFixture } from '../homework/delivery-test-helpers';
import { createActor, seedParentRelationship } from '../students/test-helpers';
import { seedSchool, seedMembership } from '../auth/test-helpers';
import * as announcements from '@/lib/modules/announcements/application';
import * as announcementFiles from '@/lib/modules/announcements/application/announcement-attachments';
import * as homework from '@/lib/modules/homework/application';
import * as homeworkFiles from '@/lib/modules/homework/application/submission-attachments';
import { assertRecoveryInventory, fingerprintTable, loadForeignKeys } from '@/scripts/recovery/inventory';
import { buildRestoreOrder } from '@/scripts/recovery/restore';
import type { QueryClient } from '@/scripts/recovery/snapshot';

const enabled = process.env.LAUNCH_LOCAL_BROWSER_FIXTURE === '1';
let pool: Pool | undefined;
let source: Awaited<ReturnType<typeof deliveryFixture>> | undefined;
afterAll(async () => { await source?.test.client.close(); await pool?.end(); });

it.skipIf(!enabled)('prepares owned native PostgreSQL browser fixtures with real authorization and private metadata', async () => {
  // A fixed owned loopback destination; never consumes DATABASE_URL or provider credentials.
  pool = new Pool({ host: '127.0.0.1', port: 55470, database: 'launch_test', user: 'postgres', ssl: false, max: 4 });
  expect((await pool.query('select current_database() name')).rows[0].name).toBe('launch_test');
  expect((await pool.query("select tablename from pg_tables where schemaname='public'")).rows).toEqual([]);
  await pool.query('create schema auth;create table auth.users(id uuid primary key,email varchar(255),phone text unique,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz);create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));create role anon;create role authenticated;create role service_role;');
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), '../../database/drizzle/migrations') });
  source = await deliveryFixture();
  const f = source;
  // Synthetic fixture dates only: the real server clock remains authoritative.
  await f.test.client.exec("update academic_years set name='2026/2027',start_date='2026-09-01',end_date='2027-06-30';update academic_periods set start_date='2026-09-01',end_date='2026-12-31';update student_enrollments set effective_from='2026-09-01';update teacher_assignments set effective_from='2026-09-01';update homework set due_date='2026-11-05';update schools set name='Launch local school',timezone='Africa/Casablanca';");
  const parent = await createActor(f.test, f.schoolId, 'PARENT');
  await seedParentRelationship(f, parent, f.child.id);
  const unrelatedParent = await createActor(f.test, f.schoolId, 'PARENT');
  const unassignedTeacher = await createActor(f.test, f.schoolId, 'TEACHER');
  const foreign = await seedSchool(f.test.seed, 'Other isolated school');
  const foreignAdmin = await createActor(f.test, foreign.id, 'SCHOOL_ADMIN');
  await seedMembership(f.test.seed, f.admin.userId!, foreign.id, 'SCHOOL_ADMIN');
  const objects = new Map<string, Uint8Array>();
  const store = {
    put: async (key: string, bytes: Uint8Array) => { if (objects.has(key)) throw Error('Fixture collision'); objects.set(key, bytes.slice()); },
    get: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw Error('Missing local fixture'); return bytes; },
    delete: async (key: string) => { objects.delete(key); },
  };
  const pdf = Buffer.from('%PDF-1.7\nMadrasio synthetic local launch file\n%%EOF');
  const draft = await announcements.createAnnouncement(f.db, f.teacher, { title: 'Launch school meeting', body: 'Synthetic announcement for local acceptance only.' });
  await announcements.addAnnouncementTargets(f.db, f.teacher, draft.announcement.id, {
    announcementVersionId: draft.version.id, targets: [
      { audience: 'PARENTS', targetType: 'CLASS', academicYearId: f.yearId, classId: f.classAId },
      { audience: 'TEACHERS', targetType: 'CLASS', academicYearId: f.yearId, classId: f.classAId },
    ],
  });
  const attachment = await announcementFiles.uploadAnnouncementAttachment(f.db, store, f.teacher, draft.announcement.id, draft.version.id, { requestId: randomUUID(), name: 'meeting.pdf', mediaType: 'application/pdf', bytes: pdf });
  const publication = await announcements.publishAnnouncement(f.db, { ...f.teacher, announcementId: draft.announcement.id, announcementVersionId: draft.version.id, idempotencyKey: randomUUID() });
  const submission = await homework.createHomeworkSubmission(f.homeworkDb, f.teacher, f.homework.id, { studentId: f.child.id, actualHandedInAt: null, content: 'Synthetic staff-recorded work.' });
  const submissionFile = await homeworkFiles.uploadSubmissionAttachment(f.homeworkDb, store, f.teacher, submission.id, { requestId: randomUUID(), name: 'homework.pdf', mediaType: 'application/pdf', bytes: pdf });
  await f.test.client.exec("set time zone 'UTC';create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));");
  const reader = f.test.client as unknown as QueryClient;
  await assertRecoveryInventory(reader);
  const order = buildRestoreOrder(await loadForeignKeys(reader));
  expect(order).toHaveLength(59);
  for (const table of order) {
    const rows = (await reader.query<{ row: unknown }>(`select to_jsonb(t) row from ${table} t`)).rows.map(row => row.row);
    if (rows.length) await pool.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(rows)]);
  }
  for (const table of order) expect(await fingerprintTable(pool, table)).toEqual(await fingerprintTable(reader, table));
  expect((await pool.query(applicationSecurityAuditSql)).rows).toEqual([]);
  const directory = path.resolve(process.cwd(), '../../test-results/v1-launch-readiness');
  const fixture = {
    schoolId: f.schoolId, foreignSchoolId: foreign.id, yearId: f.yearId, classId: f.classAId, otherClassId: f.classBId,
    childId: f.child.id, homeworkId: f.homework.id, submissionId: submission.id, submissionAttachmentId: submissionFile.id,
    announcementId: draft.announcement.id, versionId: draft.version.id, publicationId: publication.publicationId, attachmentId: attachment.id,
    actors: { admin: f.admin, teacher: f.teacher, parent, unrelatedParent, unassignedTeacher, foreignAdmin },
    assignmentId: (await pool.query('select id from teacher_assignments')).rows[0].id,
    relationshipId: (await pool.query('select id from parent_students')).rows[0].id,
    pdfSha256: (await pool.query('select sha256 from files limit 1')).rows[0].sha256,
  };
  await writeFile(path.join(directory, 'fixture.json'), JSON.stringify(fixture, null, 2));
  await writeFile(path.join(directory, 'storage.json'), JSON.stringify([...objects].map(([key, bytes]) => ({ key, bytes: Buffer.from(bytes).toString('base64') })), null, 2));
}, 60000);

// Optional second phase for the same positively identified native fixture database.
it.skipIf(process.env.LAUNCH_LOCAL_ENRICH_FIXTURE !== '1')('enriches local browser fixtures through real Finance, Timetable and Grades use cases', async () => {
  pool = new Pool({ host: '127.0.0.1', port: 55470, database: 'launch_test', user: 'postgres', ssl: false, max: 4 });
  const db = drizzle(pool, { schema });
  const file = path.resolve(process.cwd(), '../../test-results/v1-launch-readiness/fixture.json');
  const f = JSON.parse(await readFile(file, 'utf8'));
  expect((await pool.query('select current_database() name')).rows[0].name).toBe('launch_test');
  expect((await pool.query('select id from students where id=$1 and school_id=$2', [f.childId, f.schoolId])).rowCount).toBe(1);
  const period = (await pool.query('select id,start_date::text,end_date::text from academic_periods where academic_year_id=$1', [f.yearId])).rows[0];
  const klass = (await pool.query('select * from classes where id=$1', [f.classId])).rows[0];
  const assignment = (await pool.query('select * from teacher_assignments where id=$1', [f.assignmentId])).rows[0];
  const { saveConfiguration } = await import('@/lib/modules/timetable/application/service');
  const { saveDraft } = await import('@/lib/modules/timetable/application/builder');
  const { publishDraft } = await import('@/lib/modules/timetable/application/publication');
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Casablanca', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const weekday = new Date(today+'T12:00:00Z').getUTCDay() || 7;
  await db.insert(schema.curriculumSubjects).values({ schoolId:f.schoolId,curriculumVersionId:klass.curriculum_version_id,subjectId:assignment.subject_id,coefficient:'1',status:'ACTIVE' }).onConflictDoNothing();
  const revision = (await pool.query('select coalesce(max(revision),0)::int revision from timetable_configurations where school_id=$1 and academic_year_id=$2',[f.schoolId,f.yearId])).rows[0].revision;
  const config = await saveConfiguration(db,f.actors.admin,{academicYearId:f.yearId,expectedRevision:revision,days:[{day:weekday,slots:[{kind:'LESSON',start:'00:00',end:'00:30'}]}]});
  const lessonKey = randomUUID();
  const draft = await saveDraft(db,f.actors.admin,{academicYearId:f.yearId,academicPeriodId:period.id,classId:f.classId,configurationId:config.id,curriculumVersionId:klass.curriculum_version_id,startDate:period.start_date,endDate:period.end_date,expectedRevision:0,requestKey:randomUUID(),lessons:[{lessonKey,weekday,start:'00:00',end:'00:30',subjectId:assignment.subject_id,teacherAssignmentId:f.assignmentId,roomId:null}]});
  const timetable = await publishDraft(db,f.actors.admin,{academicYearId:f.yearId,academicPeriodId:period.id,classId:f.classId,draftId:draft.id,expectedRevision:draft.revision,expectedSequence:0,effectiveFrom:period.start_date,requestKey:randomUUID(),confirm:true},new Date('2026-08-31T23:00:00Z'));
  const { DEFAULT_RULES } = await import('../grades/test-helpers');
  const [grading] = await db.insert(schema.gradingConfigurations).values({schoolId:f.schoolId,name:'Launch grading'}).returning();
  const [gradingVersion] = await db.insert(schema.gradingConfigurationVersions).values({schoolId:f.schoolId,gradingConfigurationId:grading.id,versionNumber:1,status:'ACTIVE',rules:DEFAULT_RULES as unknown as typeof schema.gradingConfigurationVersions.$inferInsert.rules}).returning();
  const grades = await import('@/lib/modules/grades/application');
  const book = await grades.createGradebook(db,f.actors.admin,{academicYearId:f.yearId,academicPeriodId:period.id,classId:f.classId,subjectId:assignment.subject_id,gradingConfigurationVersionId:gradingVersion.id,name:'Launch Mathematics'});
  const assessment = await grades.createAssessment(db,f.actors.admin,book.id,{title:'Launch assessment',assessmentType:'EXAM',maximumScore:'20',weight:'1'});
  await grades.patchGradebook(db,f.actors.admin,book.id,{status:'OPEN'});
  await grades.patchAssessment(db,f.actors.admin,assessment.id,{status:'PUBLISHED'});
  await grades.putAssessmentGrades(db,f.actors.teacher,assessment.id,{grades:[{studentId:f.childId,state:'VALID',score:'15.50'}]});
  await grades.patchGradebook(db,f.actors.admin,book.id,{status:'CLOSED'});
  const result = await grades.calculateSubjectResult(db,{...f.actors.admin,gradebookId:book.id,studentId:f.childId});
  await grades.finalizeResult(db,{...f.actors.admin,resultType:'SUBJECT',resultId:result.id});
  const published = await grades.publishResult(db,{...f.actors.admin,resultType:'SUBJECT',resultId:result.id,idempotencyKey:randomUUID()});
  const finance = await import('@/lib/modules/finance/application/service');
  const payments = await import('@/lib/modules/finance/application/payments');
  const fee = await finance.saveFeeType(db,f.actors.admin,{name:'Launch tuition'});
  const structure = await finance.saveStructure(db,f.actors.admin,{academicYearId:f.yearId,feeTypeId:fee.id,amountCents:12345,cadence:'MONTHLY',periods:[{period:'2026-10',dueDate:'2026-10-10'},{period:'2026-11',dueDate:'2026-11-10'}]});
  const input = {structureId:structure.id,studentIds:[f.childId],periods:['2026-10','2026-11']};
  const preview = await finance.previewCharges(db,f.actors.admin,input);
  const charges = await finance.generateCharges(db,f.actors.admin,{...input,previewHash:preview.previewHash,requestKey:randomUUID()});
  const paymentIds=[];
  for (const [method,amountCents] of [['CASH',4500],['BANK_TRANSFER',3500],['CHEQUE',4345]] as const) {
    const payment = await payments.recordPayment(db,f.actors.admin,{requestKey:randomUUID(),confirmed:true,studentId:f.childId,method,amountCents,receivedOn:today,allocations:[{chargeId:charges.chargeIds[0],amountCents}]});
    paymentIds.push(payment.id);
  }
  expect((await finance.chargeDetail(db,f.actors.admin,charges.chargeIds[0])).charge.allocatedCents).toBe(12345);
  Object.assign(f,{today,timetablePublicationId:timetable.id,lessonKey,periodId:period.id,subjectId:assignment.subject_id,gradebookId:book.id,assessmentId:assessment.id,resultId:result.id,resultPublicationId:published.publicationId,chargeIds:charges.chargeIds,paymentIds});
  await writeFile(file,JSON.stringify(f,null,2));
},60000);
