import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentContext } from '@/lib/authorization/context';
import { UnauthenticatedError } from '@/lib/errors';
import type { AcademicStructureDb } from '@/lib/modules/academic-structure/infrastructure/repositories/academic-structure-repository';

import { createAuthTestDb, seedMembership, seedSchool, seedUser, type AuthTestDb } from '../auth/test-helpers';

const mocks = vi.hoisted(() => ({ db: null as unknown, context: null as unknown, authError: null as unknown }));
vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/lib/auth/require-context', () => ({ requireCurrentContext: async () => { if (mocks.authError) throw mocks.authError; return mocks.context; } }));

import { academicYearGET, academicYearPATCH, academicYearsGET, academicYearsPOST, classesGET, classesPOST, curriculumSubjectsPOST, subjectGET, subjectsGET, subjectsPOST, versionGET } from '@/lib/api/academic-structure';

let test: AuthTestDb;
let schoolId: string;
let userId: string;

beforeEach(async () => {
  test = await createAuthTestDb(); mocks.db = test.seed as unknown as AcademicStructureDb; mocks.authError = null;
  const school = await seedSchool(test.seed); schoolId = school.id; userId = await seedUser(test.seed); await seedMembership(test.seed, userId, schoolId, 'SCHOOL_ADMIN');
  mocks.context = { userId, userActive: true, membership: { schoolId, status: 'ACTIVE' }, schoolContext: { schoolId, isValid: true }, role: 'SCHOOL_ADMIN', scope: { teacherAssignments: [], parentStudents: [] } } satisfies CurrentContext;
});

const json = (url: string, method: string, body: unknown) => new Request(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const params = (values: Record<string, string>) => ({ params: Promise.resolve(values) });

describe('representative academic structure HTTP contracts', () => {
  it('GET/POST/PATCH academic years use envelopes, pagination and controlled lifecycle errors', async () => {
    const createdResponse = await academicYearsPOST(json('http://local/api/v1/academic-years', 'POST', { name: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-01' }));
    expect(createdResponse.status).toBe(201); const created = (await createdResponse.json()).data;
    const list = await academicYearsGET(new Request('http://local/api/v1/academic-years?page=1&pageSize=10'));
    expect(await list.json()).toMatchObject({ data: [{ id: created.id }], meta: { page: 1, pageSize: 10, total: 1 } });
    expect((await academicYearGET(new Request('http://local'), params({ id: created.id }))).status).toBe(200);
    const invalid = await academicYearPATCH(json('http://local', 'PATCH', { status: 'ARCHIVED' }), params({ id: created.id }));
    expect(await invalid.json()).toMatchObject({ error: { featureCode: 'INVALID_STATUS_TRANSITION' } });
  });

  it('rejects malformed payloads and client-provided schoolId', async () => {
    const malformed = await subjectsPOST(new Request('http://local', { method: 'POST', body: '{' }));
    expect(malformed.status).toBe(400);
    const foreign = await subjectsPOST(json('http://local', 'POST', { schoolId: crypto.randomUUID(), name: 'Math' }));
    expect(foreign.status).toBe(400);
  });

  it('GET/POST subjects are bounded and cross-school detail is hidden', async () => {
    const response = await subjectsPOST(json('http://local', 'POST', { name: 'Mathematics', code: 'MATH' }));
    const subject = (await response.json()).data;
    const list = await subjectsGET(new Request('http://local/api/v1/subjects?search=math'));
    expect((await list.json()).data).toHaveLength(1);
    const otherSchool = await seedSchool(test.seed, 'Other'); const otherUser = await seedUser(test.seed); await seedMembership(test.seed, otherUser, otherSchool.id, 'SCHOOL_ADMIN');
    mocks.context = { ...(mocks.context as CurrentContext), userId: otherUser, membership: { schoolId: otherSchool.id, status: 'ACTIVE' }, schoolContext: { schoolId: otherSchool.id, isValid: true } };
    const hidden = await subjectGET(new Request('http://local'), params({ id: subject.id }));
    expect(hidden.status).toBe(404);
  });

  it('GET/POST classes validate exact academic context', async () => {
    const year = (await (await academicYearsPOST(json('http://local', 'POST', { name: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-01' }))).json()).data;
    const stage = await test.seed.insert((await import('@school/database')).stages).values({ schoolId, name: 'Primary', sequence: 1 }).returning();
    const level = await test.seed.insert((await import('@school/database')).levels).values({ schoolId, stageId: stage[0].id, name: 'Year 1', sequence: 1 }).returning();
    const curriculum = await test.seed.insert((await import('@school/database')).curricula).values({ schoolId, name: 'National' }).returning();
    const version = await test.seed.insert((await import('@school/database')).curriculumVersions).values({ schoolId, curriculumId: curriculum[0].id, name: 'v1' }).returning();
    const created = await classesPOST(json('http://local', 'POST', { academicYearId: year.id, levelId: level[0].id, curriculumVersionId: version[0].id, name: 'Class A' }));
    expect(created.status).toBe(201); expect((await classesGET(new Request(`http://local/api/v1/classes?academicYearId=${year.id}`))).status).toBe(200);
    const bad = await classesPOST(json('http://local', 'POST', { academicYearId: crypto.randomUUID(), levelId: level[0].id, curriculumVersionId: version[0].id, name: 'Bad' }));
    expect(await bad.json()).toMatchObject({ error: { featureCode: 'NOT_FOUND' } });
  });

  it('GET CurriculumVersion and nested POST subject expose controlled immutable errors', async () => {
    const schema = await import('@school/database');
    const curriculum = await test.seed.insert(schema.curricula).values({ schoolId, name: 'National' }).returning();
    const version = await test.seed.insert(schema.curriculumVersions).values({ schoolId, curriculumId: curriculum[0].id, name: 'v1', status: 'ACTIVE' }).returning();
    const subject = await test.seed.insert(schema.subjects).values({ schoolId, name: 'Math' }).returning();
    expect((await versionGET(new Request('http://local'), params({ id: version[0].id }))).status).toBe(200);
    const response = await curriculumSubjectsPOST(json('http://local', 'POST', { subjectId: subject[0].id, coefficient: '5' }), params({ id: version[0].id }));
    expect(await response.json()).toMatchObject({ error: { featureCode: 'CURRICULUM_VERSION_IMMUTABLE' } });
  });

  it('maps unauthenticated CurrentContext resolution to 401', async () => {
    mocks.authError = new UnauthenticatedError();
    const response = await academicYearsGET(new Request('http://local/api/v1/academic-years'));
    expect(response.status).toBe(401); expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });
});
