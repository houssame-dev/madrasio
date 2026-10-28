// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { createStudentsTestContext, createActor, seedStudent, seedTeacherScope, seedParentRelationship } from '../students/test-helpers';
import { seedSchool } from '../auth/test-helpers';
import { searchRecords } from '@/lib/modules/search/service';
import { searchQuerySchema } from '@/lib/modules/search/contracts';
let f: Awaited<ReturnType<typeof createStudentsTestContext>>;
const now = new Date('2025-10-10T12:00:00Z');
beforeEach(async () => { f = await createStudentsTestContext(); }, 30000);
afterEach(async () => { await f.test.client.close(); });
const find = (actor = f.admin, q = 'Amine', category = 'all') => searchRecords(f.test.seed, actor, { q, category }, now);
it('rejects invalid, unbounded and caller-authority fields', () => {
  for (const q of ['', 'a', ' '.repeat(3), 'a'.repeat(81)]) expect(searchQuerySchema.safeParse({ q }).success).toBe(false);
  expect(searchQuerySchema.parse({ q: '  Amine  ' })).toEqual({ q: 'Amine', category: 'all' });
  for (const field of ['schoolId', 'role', 'userId', 'studentId', 'pageSize']) expect(searchQuerySchema.safeParse({ q: 'ok', [field]: 'spoof' }).success).toBe(false);
});
it('returns minimal stable bounded projections and no foreign School rows or totals', async () => {
  const foreign = await seedSchool(f.test.seed);
  for (let i = 0; i < 9; i++) await seedStudent(f.test, f.schoolId, String(i));
  const secret = await seedStudent(f.test, foreign.id, 'foreign');
  const response = await find(); expect(response.data).toHaveLength(6);
  expect(response.scope).toMatchObject({ userId: f.admin.userId, schoolId: f.schoolId, role: 'SCHOOL_ADMIN' });
  for (const row of response.data) expect(Object.keys(row).sort()).toEqual(['category', 'detail', 'href', 'id', 'name']);
  expect(JSON.stringify(response)).not.toContain(secret.id);
  expect(response).not.toHaveProperty('total'); expect(await find()).toEqual(response);
});
it('searches literal wildcard characters and a full entered name/code without changing directory behavior', async () => {
  const person = await seedStudent(f.test, f.schoolId);
  await f.test.seed.update(s.students).set({ firstName: 'A%_\\name', studentCode: 'UNIQUE-4242' }).where(eq(s.students.id, person.id));
  await seedStudent(f.test, f.schoolId, 'ordinary');
  expect((await find(f.admin, '%_\\')).data.map(r => r.id)).toEqual([person.id]);
  expect((await find(f.admin, 'A%_\\name Benali')).data.map(r => r.id)).toEqual([person.id]);
  expect((await find(f.admin, '4242')).data[0].id).toBe(person.id);
});
it('uses real Admin profile routes and a scoped existing Classes destination', async () => {
  await f.test.seed.insert(s.teachers).values({ schoolId: f.schoolId, firstName: 'Amine', lastName: 'Teacher' });
  await f.test.seed.insert(s.parents).values({ schoolId: f.schoolId, firstName: 'Amine', lastName: 'Parent' });
  for (const category of ['teachers', 'parents']) {
    const value = await find(f.admin, 'Amine', category); expect(value.data).toHaveLength(1);
    expect(value.data[0].href).toBe(`/${category}/${value.data[0].id}`);
  }
  const row = (await find(f.admin, 'Class A', 'classes')).data[0], url = new URL(row.href, 'http://local');
  expect(url.pathname).toBe('/academic'); expect(url.searchParams.get('yearId')).toBe(f.yearId); expect(url.searchParams.get('section')).toBe('classes'); expect(url.searchParams.get('search')).toBe('Class A');
});
it('restricts Teacher students/classes to active current dated assignments and enrollment, with no duplicate results', async () => {
  const teacher = await createActor(f.test, f.schoolId, 'TEACHER');
  await seedTeacherScope(f, teacher, f.classAId);
  await seedTeacherScope(f, teacher, f.classAId);
  const student = await seedStudent(f.test, f.schoolId), other = await seedStudent(f.test, f.schoolId, 'other');
  await f.test.seed.insert(s.studentEnrollments).values([student, other].map((row, i) => ({ schoolId: f.schoolId, studentId: row.id, academicYearId: f.yearId, classId: i ? f.classBId : f.classAId, effectiveFrom: '2025-09-01', status: 'ACTIVE' as const })));
  expect((await find(teacher)).data.map(v => v.id)).toEqual([student.id]);
  expect((await find(teacher, 'Class', 'classes')).data.map(v => v.id)).toEqual([f.classAId]);
  for (const category of ['parents', 'teachers', 'children']) await expect(find(teacher, 'Amine', category)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect((await searchRecords(f.test.seed, teacher, { q: 'Amine' }, new Date('2025-08-31T23:00:00Z'))).data).toEqual([]);
  await f.test.seed.update(s.teacherAssignments).set({ effectiveUntil: '2025-10-09' });
  expect((await find(teacher)).data).toEqual([]); expect((await find(teacher, 'Class', 'classes')).data).toEqual([]);
});
it('rechecks changed assignments/profile/enrollment state rather than cached entitlements', async () => {
  const teacher = await createActor(f.test, f.schoolId, 'TEACHER'), scope = await seedTeacherScope(f, teacher, f.classAId), student = await seedStudent(f.test, f.schoolId);
  const [enrollment] = await f.test.seed.insert(s.studentEnrollments).values({ schoolId: f.schoolId, studentId: student.id, academicYearId: f.yearId, classId: f.classAId, effectiveFrom: '2025-09-01' }).returning();
  expect((await find(teacher)).data).toHaveLength(1);
  await f.test.seed.update(s.studentEnrollments).set({ effectiveUntil: '2025-10-09' }).where(eq(s.studentEnrollments.id, enrollment.id));
  expect((await find(teacher)).data).toHaveLength(0);
  await f.test.seed.update(s.studentEnrollments).set({ effectiveUntil: null });
  await f.test.seed.update(s.teachers).set({ status: 'INACTIVE' }).where(eq(s.teachers.id, scope.teacher.id));
  expect((await find(teacher)).data).toHaveLength(0);
});
it('exposes only active Parent-linked children, handles no profile and revocation without general directory access', async () => {
  const parent = await createActor(f.test, f.schoolId, 'PARENT'), child = await seedStudent(f.test, f.schoolId), unrelated = await seedStudent(f.test, f.schoolId, 'other');
  expect((await find(parent)).data).toEqual([]);
  await seedParentRelationship(f, parent, child.id);
  const response = await find(parent); expect(response.data).toHaveLength(1);
  expect(response.data[0]).toMatchObject({ id: child.id, category: 'children', href: `/children/${child.id}` });
  expect(JSON.stringify(response)).not.toContain(unrelated.id);
  for (const category of ['students', 'teachers', 'parents', 'classes']) await expect(find(parent, 'Amine', category)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await f.test.seed.update(s.parents).set({ status: 'INACTIVE' });
  expect((await find(parent)).data).toEqual([]);
  await f.test.seed.update(s.parents).set({ status: 'ACTIVE' });
  await f.test.seed.update(s.parentStudents).set({ status: 'ENDED' });
  expect((await find(parent)).data).toEqual([]);
});
it('binds multi-role visibility to the selected membership and denies foreign/inactive contexts', async () => {
  const foreign = await seedSchool(f.test.seed), child = await seedStudent(f.test, f.schoolId);
  await f.test.seed.insert(s.schoolMemberships).values({ userId: f.admin.userId!, schoolId: foreign.id, role: 'PARENT', status: 'ACTIVE' });
  expect((await find()).data[0].id).toBe(child.id);
  const changed = await find({ userId: f.admin.userId, schoolId: foreign.id }); expect(changed.scope.role).toBe('PARENT'); expect(changed.data).toEqual([]);
  await expect(find({ userId: null, schoolId: f.schoolId })).rejects.toBeDefined();
  await f.test.seed.update(s.schools).set({ status: 'INACTIVE' }).where(eq(s.schools.id, f.schoolId));
  await expect(find()).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it.each(['membership', 'user'] as const)('rejects an inactive %s without disclosing matching identities', async target => {
  await seedStudent(f.test, f.schoolId);
  if (target === 'membership') await f.test.seed.update(s.schoolMemberships).set({ status: 'INACTIVE' }).where(eq(s.schoolMemberships.userId, f.admin.userId!));
  else await f.test.seed.update(s.users).set({ status: 'SUSPENDED' }).where(eq(s.users.id, f.admin.userId!));
  await expect(find()).rejects.toBeDefined();
});
