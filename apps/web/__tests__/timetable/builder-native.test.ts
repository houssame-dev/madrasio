// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { seedSchool, seedStudentAndActors } from '../grades/test-helpers';
import { saveConfiguration, saveRoom } from '@/lib/modules/timetable/application/service';
import { saveDraft, getDraft } from '@/lib/modules/timetable/application/builder';
import { publishDraft } from '@/lib/modules/timetable/application/publication';
import type { DraftInput } from '@/lib/modules/timetable/domain/builder';
const portText = process.env.TIMETABLE_LOCAL_PG_PORT;
describe.skipIf(!portText)('native PostgreSQL timetable serialization, independent connections', () => {
  const pool = new Pool({ host: '127.0.0.1', port: Number(portText), database: 'timetable_test', user: 'postgres', ssl: false, max: 8, statement_timeout: 10000, connectionTimeoutMillis: 5000, application_name: 'TIMETABLE_PHASE2' });
  const db = drizzle(pool, { schema: s });
  let school: Awaited<ReturnType<typeof seedSchool>>, actor: { schoolId: string; userId: string }, classB: string, configA: string, configB: string, assignmentA: string, assignmentB: string, roomId: string;
  beforeAll(async () => {
    if (!/^\d{4,5}$/.test(portText!) || Number(portText) < 1024 || Number(portText) > 65535) throw new Error('Invalid owned local test port');
    expect((await pool.query("select current_database() as name, current_setting('server_version') as version")).rows[0]).toMatchObject({ name: 'timetable_test', version: expect.stringMatching(/^17\.6/) });
    expect((await pool.query("select tablename from pg_tables where schemaname='public'")).rows).toEqual([]);
    await pool.query('create schema auth; create table auth.users(id uuid primary key,email varchar(255),phone text unique,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz); create role anon; create role authenticated; create role service_role;');
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), '../../database/drizzle/migrations') });
    const a = await pool.connect(), b = await pool.connect();
    try { expect((await a.query('select pg_backend_pid() id')).rows[0].id).not.toBe((await b.query('select pg_backend_pid() id')).rows[0].id); } finally { a.release(); b.release(); }
  }, 30000);
  beforeEach(async () => {
    const seed = db as unknown as Parameters<typeof seedSchool>[0]; school = await seedSchool(seed); const people = await seedStudentAndActors(seed, school.schoolId, school.yearId, school.classId); actor = { userId: people.schoolAdminUserId, schoolId: school.schoolId };
    const [original] = await db.select().from(s.classes).where(eq(s.classes.id, school.classId));
    const [level] = await db.select().from(s.levels).where(eq(s.levels.id, original.levelId));
    const levelB = randomUUID(); await db.insert(s.levels).values({ id: levelB, schoolId: school.schoolId, stageId: level.stageId, name: 'Native other level', sequence: 5 });
    classB = randomUUID(); await db.insert(s.classes).values({ ...original, id: classB, name: 'Native B', levelId: levelB });
    configA = (await saveConfiguration(db, actor, { academicYearId: school.yearId, expectedRevision: 0, days: [{ day: 1, slots: [{ kind: 'LESSON', start: '08:00', end: '09:00' }] }] })).id;
    configB = (await saveConfiguration(db, actor, { academicYearId: school.yearId, levelId: levelB, expectedRevision: 0, days: [{ day: 1, slots: [{ kind: 'LESSON', start: '08:30', end: '09:30' }] }] })).id;
    assignmentA = randomUUID(); assignmentB = randomUUID(); await db.insert(s.teacherAssignments).values([{ id: assignmentA, schoolId: school.schoolId, academicYearId: school.yearId, classId: school.classId, subjectId: school.subjectMathId, teacherId: people.teacherId, effectiveFrom: '2025-09-01' }, { id: assignmentB, schoolId: school.schoolId, academicYearId: school.yearId, classId: classB, subjectId: school.subjectMathId, teacherId: people.teacherId, effectiveFrom: '2025-09-01' }]);
    roomId = (await saveRoom(db, actor, { name: 'Native lab', kind: 'LAB', active: true, expectedRevision: 0 })).id;
  });
  afterAll(async () => { await pool.end(); });
  const input = (other = false): DraftInput => ({ academicYearId: school.yearId, academicPeriodId: school.period1Id, classId: other ? classB : school.classId, configurationId: other ? configB : configA, curriculumVersionId: school.curriculumVersionId, startDate: '2025-09-01', endDate: '2025-12-20', expectedRevision: 0, requestKey: randomUUID(), lessons: [{ lessonKey: randomUUID(), weekday: 1, start: other ? '08:30' : '08:00', end: other ? '09:30' : '09:00', subjectId: school.subjectMathId, teacherAssignmentId: other ? assignmentB : assignmentA, roomId }] });
  async function waitForBlocked(minimum: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const waiting = (await pool.query("select count(*)::int n from pg_stat_activity where datname='timetable_test' and application_name='TIMETABLE_PHASE2' and wait_event_type='Lock'")).rows[0].n;
      if (waiting >= minimum) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Expected independent lock waiters were not observed');
  }
  async function contested(work: () => Promise<PromiseSettledResult<unknown>[]>) {
    const blocker = await pool.connect(); await blocker.query('begin'); await blocker.query('select id from schools where id=$1 for update', [school.schoolId]);
    const pending = work();
    try { await waitForBlocked(2); } finally { await blocker.query('commit'); blocker.release(); }
    return pending;
  }
  it.each(['TEACHER', 'ROOM'] as const)('admits only one overlapping cross-Level %s reservation under actual lock contention', async kind => {
    const first = input(), second = input(true);
    if (kind === 'TEACHER') { first.lessons[0].roomId = null; second.lessons[0].roomId = null; }
    else {
      const teacherId = randomUUID(), assignment = randomUUID();
      await db.insert(s.teachers).values({ id: teacherId, schoolId: school.schoolId, firstName: 'Independent', lastName: 'Teacher' });
      await db.insert(s.teacherAssignments).values({ id: assignment, schoolId: school.schoolId, academicYearId: school.yearId, classId: classB, subjectId: school.subjectMathId, teacherId, effectiveFrom: '2025-09-01' }); second.lessons[0].teacherAssignmentId = assignment;
    }
    const results = await contested(() => Promise.allSettled([saveDraft(db, actor, first), saveDraft(db, actor, second)]));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); const failed = results.find(r => r.status === 'rejected');
    expect(failed?.status === 'rejected' ? failed.reason : null).toMatchObject({ code: 'CONFLICT', details: { kind: 'SCHEDULING_CONFLICT', conflicts: [expect.objectContaining({ kind })] } });
  });
  it('admits only one of two differing saves against the same Class revision', async () => {
    const first = input(), second = { ...input(), lessons: [] };
    const results = await contested(() => Promise.allSettled([saveDraft(db, actor, first), saveDraft(db, actor, second)]));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await getDraft(db, actor, { academicYearId: school.yearId, academicPeriodId: school.period1Id, classId: school.classId })).draft?.revision).toBe(1);
  });
  it('persists only one revision for concurrent identical request keys', async () => {
    const body = input(); const results = await contested(() => Promise.allSettled([saveDraft(db, actor, body), saveDraft(db, actor, body)])); expect(results[0]).toEqual(results[1]);
  });
  it('rechecks lifecycle after a blocked save, without creating a draft', async () => {
    const blocker = await pool.connect(); await blocker.query('begin'); await blocker.query('select id from schools where id=$1 for update', [school.schoolId]);
    const pending = saveDraft(db, actor, input()).then(() => false, () => true);
    try { await waitForBlocked(1); await pool.query("update users set status='SUSPENDED' where id=$1", [actor.userId]); } finally { await blocker.query('commit'); blocker.release(); }
    expect(await pending).toBe(true); expect((await pool.query('select id from timetable_drafts where school_id=$1', [school.schoolId])).rows).toEqual([]);
  });
  const publication = (draft: { id: string; revision: number }, other = false) => ({ academicYearId: school.yearId, academicPeriodId: school.period1Id, classId: other ? classB : school.classId, draftId: draft.id, expectedRevision: draft.revision, expectedSequence: 0, effectiveFrom: '2025-09-01', requestKey: randomUUID(), confirm: true });
  it('serializes competing publication revisions without silently overwriting either event', async () => {
    const draft = await saveDraft(db, actor, input()), first = publication(draft), second = { ...publication(draft), effectiveFrom: '2025-09-08' };
    const results = await contested(() => Promise.allSettled([publishDraft(db, actor, first, new Date('2025-09-01T12:00:00Z')), publishDraft(db, actor, second, new Date('2025-09-01T12:00:00Z'))]));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect((await db.select().from(s.timetablePublications).where(eq(s.timetablePublications.schoolId, school.schoolId)))).toHaveLength(1);
  });
  it('replays simultaneous identical publication requests exactly once', async () => {
    const draft = await saveDraft(db, actor, input()), body = publication(draft);
    const results = await contested(() => Promise.allSettled([publishDraft(db, actor, body, new Date('2025-09-01T12:00:00Z')), publishDraft(db, actor, body, new Date('2025-09-01T12:00:00Z'))]));
    expect(results[0]).toEqual(results[1]); expect((await db.select().from(s.timetablePublications).where(eq(s.timetablePublications.schoolId, school.schoolId)))).toHaveLength(1);
  });
  it('rejects concurrent cross-Level conflicting publications, even for preexisting conflicting draft fixtures', async () => {
    const first = await saveDraft(db, actor, input());
    // Deliberately stage two conflicting, FK-valid drafts to exercise publication's independent guard.
    const [source] = await db.select().from(s.timetableDrafts).where(eq(s.timetableDrafts.id, first.id));
    const [other] = await db.insert(s.timetableDrafts).values({ ...source, id: randomUUID(), classId: classB, configurationId: configB, requestKey: randomUUID(), requestHash: '0'.repeat(64) }).returning();
    await db.insert(s.timetableLessons).values({ schoolId: school.schoolId, academicYearId: school.yearId, classId: classB, draftId: other.id, lessonKey: randomUUID(), weekday: 1, startMinute: 510, endMinute: 570, subjectId: school.subjectMathId, teacherAssignmentId: assignmentB, teacherId: (await db.select().from(s.teacherAssignments).where(eq(s.teacherAssignments.id, assignmentB)))[0].teacherId, roomId });
    const results = await contested(() => Promise.allSettled([publishDraft(db, actor, publication(first), new Date('2025-09-01T12:00:00Z')), publishDraft(db, actor, publication(other, true), new Date('2025-09-01T12:00:00Z'))]));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(r => r.status === 'rejected'); expect(failure?.status === 'rejected' ? failure.reason : null).toMatchObject({ details: { kind: 'SCHEDULING_CONFLICT', conflicts: expect.arrayContaining([expect.objectContaining({ kind: 'TEACHER' }), expect.objectContaining({ kind: 'ROOM' })]) } });
  });
});
