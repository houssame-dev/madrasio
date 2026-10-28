// @vitest-environment node
import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import * as s from '@school/database';
import { createGradesTestDb, seedSchool, seedStudentAndActors } from '../grades/test-helpers';
import { saveConfiguration, saveLoad, saveRoom, state, type TimetableDb } from '@/lib/modules/timetable/application/service';
import { assertRecoveryInventory, fingerprintTable, loadForeignKeys } from '@/scripts/recovery/inventory';
import { assertForeignKeyIntegrity, buildRestoreOrder } from '@/scripts/recovery/restore';
import { compareFingerprints } from '@/scripts/recovery/manifest';
import type { QueryClient } from '@/scripts/recovery/snapshot';
import { getDraft, saveDraft } from '@/lib/modules/timetable/application/builder';
import { publishDraft, readPublished } from '@/lib/modules/timetable/application/publication';

it('restores nonempty timetable revisions and room audit history in FK order with all 60 fingerprints', async () => {
  const source = await createGradesTestDb(), target = await createGradesTestDb();
  try {
    for (const instance of [source, target]) await instance.client.exec('create table auth.identities(id uuid primary key,user_id uuid not null references auth.users(id),provider text not null)');
    const school = await seedSchool(source.seed), actors = await seedStudentAndActors(source.seed, school.schoolId, school.yearId, school.classId);
    const db = source.seed as unknown as TimetableDb, actor = { userId: actors.schoolAdminUserId, schoolId: school.schoolId }, assignmentId = randomUUID();
    await source.seed.insert(s.teacherAssignments).values({ id: assignmentId, schoolId: school.schoolId, teacherId: actors.teacherId, academicYearId: school.yearId, classId: school.classId, subjectId: school.subjectMathId, effectiveFrom: '2025-09-01' });
    const days = [{ day: 1, slots: [{ kind: 'LESSON', start: '08:00', end: '09:00' }] }];
    await saveConfiguration(db, actor, { academicYearId: school.yearId, expectedRevision: 0, days });
    await saveConfiguration(db, actor, { academicYearId: school.yearId, expectedRevision: 1, days: [{ day: 2, slots: days[0].slots }] });
    const room = await saveRoom(db, actor, { name: 'Lab', kind: 'LAB', active: true, expectedRevision: 0 });
    await saveLoad(db, actor, { academicYearId: school.yearId, classId: school.classId, subjectId: school.subjectMathId, teacherAssignmentId: assignmentId, roomId: room.id, lessonsPerWeek: 3, durationMinutes: 60, enabled: true, expectedRevision: 0 });
    const context = { academicYearId: school.yearId, academicPeriodId: school.period1Id, classId: school.classId };
    const editor = await getDraft(db, actor, context);
    const draftInput = { ...context, configurationId: editor.configuration!.id, curriculumVersionId: school.curriculumVersionId, startDate: '2025-09-01', endDate: '2025-12-20', expectedRevision: 0, requestKey: randomUUID(), lessons: [{ lessonKey: randomUUID(), weekday: 2, start: '08:00', end: '09:00', subjectId: school.subjectMathId, teacherAssignmentId: assignmentId, roomId: room.id }] };
    await saveDraft(db, actor, draftInput);
    await saveDraft(db, actor, { ...draftInput, expectedRevision: 1, requestKey: randomUUID(), lessons: draftInput.lessons.map(l => ({ ...l, roomId: null })) });
    const savedDraft = await getDraft(db, actor, context);
    await publishDraft(db, actor, { ...context, draftId: savedDraft.draft!.id, expectedRevision: 2, expectedSequence: 0, effectiveFrom: '2025-09-01', requestKey: randomUUID(), confirm: true }, new Date('2025-09-01T12:00:00Z'));
    const a = source.client as unknown as QueryClient, b = target.client as unknown as QueryClient;
    await assertRecoveryInventory(a); await assertRecoveryInventory(b);
    const order = buildRestoreOrder(await loadForeignKeys(a)); expect(order).toHaveLength(60);
    expect(order.indexOf('public.timetable_loads')).toBeGreaterThan(order.indexOf('public.teacher_assignments'));
    expect(order.indexOf('public.timetable_loads')).toBeGreaterThan(order.indexOf('public.timetable_rooms'));
    const fingerprints = await Promise.all(order.map(table => fingerprintTable(a, table)));
    for (const table of order) {
      const rows = (await source.client.query<{ record: unknown }>(`select to_jsonb(t) record from ${table} t`)).rows;
      if (rows.length) await target.client.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(rows.map(row => row.record))]);
    }
    expect(() => compareFingerprints(fingerprints, [])).toThrow();
    const restored = await Promise.all(order.map(table => fingerprintTable(b, table)));
    expect(() => compareFingerprints(fingerprints, restored)).not.toThrow();
    await assertForeignKeyIntegrity(b);
    expect(await state(target.seed as unknown as TimetableDb, actor, school.yearId)).toEqual(await state(db, actor, school.yearId));
    expect(await getDraft(target.seed as unknown as TimetableDb, actor, context)).toEqual(await getDraft(db, actor, context));
    expect(await readPublished(target.seed as unknown as TimetableDb, actor, { date: '2025-09-02' })).toEqual(await readPublished(db, actor, { date: '2025-09-02' }));
    for (const table of ['timetable_configurations', 'timetable_loads', 'timetable_rooms', 'timetable_drafts', 'timetable_lessons', 'timetable_publications'] as const) {
      const before = await fingerprintTable(b, `public.${table}`);
      const change = table === 'timetable_publications' ? `snapshot=jsonb_set(snapshot,'{className}','"Altered"')` : table === 'timetable_loads' ? 'lessons_per_week=lessons_per_week+1' : table === 'timetable_rooms' ? "name='Altered'" : table === 'timetable_drafts' ? "request_hash=request_hash||'altered'" : table === 'timetable_lessons' ? 'start_minute=start_minute+1' : 'enabled=false';
      await target.client.exec(`update ${table} set ${change}`);
      const altered = await fingerprintTable(b, `public.${table}`);
      expect(() => compareFingerprints([before], [altered])).toThrow();
    }
  } finally { await source.client.close(); await target.client.close(); }
}, 30000);
