import { eq } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../drizzle/schema';
import { createTestDb, type Db } from './helpers';

let db: Db;

async function createAuthUser(id: string = randomUUID()) {
  await db.insert(authUsers).values({ id });
  return id;
}

async function createUser(id: string = randomUUID()) {
  await createAuthUser(id);
  await db.insert(schema.users).values({ id });
  return id;
}

async function createSchool(name: string = randomUUID()) {
  const [school] = await db.insert(schema.schools).values({ name }).returning();
  return school;
}

beforeEach(async () => {
  ({ db } = await createTestDb());
});

describe('users — ADR-018 shared UUID with Supabase Auth', () => {
  it('creates an application user whose id equals the auth.users id', async () => {
    const id = randomUUID();
    await createAuthUser(id);

    const [row] = await db.insert(schema.users).values({ id }).returning();

    expect(row.id).toBe(id);
  });

  it('rejects an application user whose id does not exist in auth.users', async () => {
    await expect(db.insert(schema.users).values({ id: randomUUID() })).rejects.toThrow();
  });

  it('cascades deletion of an auth user to the application user', async () => {
    const id = await createUser();

    await db.delete(authUsers).where(eq(authUsers.id, id));

    const remaining = await db.select().from(schema.users).where(eq(schema.users.id, id));
    expect(remaining).toHaveLength(0);
  });
});

describe('users — lifecycle status (Task 014.1)', () => {
  it('a new user defaults to ACTIVE', async () => {
    const id = await createAuthUser();
    const [row] = await db.insert(schema.users).values({ id }).returning();
    expect(row.status).toBe('ACTIVE');
  });

  it('accepts an explicit ACTIVE status', async () => {
    const id = await createAuthUser();
    const [row] = await db.insert(schema.users).values({ id, status: 'ACTIVE' }).returning();
    expect(row.status).toBe('ACTIVE');
  });

  it('accepts SUSPENDED status', async () => {
    const id = await createAuthUser();
    const [row] = await db.insert(schema.users).values({ id, status: 'SUSPENDED' }).returning();
    expect(row.status).toBe('SUSPENDED');
  });

  it('accepts DISABLED status', async () => {
    const id = await createAuthUser();
    const [row] = await db.insert(schema.users).values({ id, status: 'DISABLED' }).returning();
    expect(row.status).toBe('DISABLED');
  });

  it('rejects an invalid status value', async () => {
    const id = await createAuthUser();
    await expect(
      db.insert(schema.users).values({ id, status: 'BANNED' as never }),
    ).rejects.toThrow();
  });

  it('a status update does not delete User relationships (membership remains)', async () => {
    const userId = await createUser();
    const school = await createSchool();
    const [membership] = await db
      .insert(schema.schoolMemberships)
      .values({ schoolId: school.id, userId, role: 'SCHOOL_ADMIN' })
      .returning();

    const [updated] = await db
      .update(schema.users)
      .set({ status: 'SUSPENDED' })
      .where(eq(schema.users.id, userId))
      .returning();
    expect(updated.status).toBe('SUSPENDED');

    const membershipsAfter = await db
      .select()
      .from(schema.schoolMemberships)
      .where(eq(schema.schoolMemberships.id, membership.id));
    expect(membershipsAfter).toHaveLength(1);
    expect(membershipsAfter[0].status).toBe('ACTIVE');

    const schoolAfter = await db.select().from(schema.schools).where(eq(schema.schools.id, school.id));
    expect(schoolAfter).toHaveLength(1);
  });

  it('membership and school history remain after a user is disabled', async () => {
    const userId = await createUser();
    const school = await createSchool();
    await db.insert(schema.schoolMemberships).values({ schoolId: school.id, userId, role: 'TEACHER' });

    await db.update(schema.users).set({ status: 'DISABLED' }).where(eq(schema.users.id, userId));

    const memberships = await db
      .select()
      .from(schema.schoolMemberships)
      .where(eq(schema.schoolMemberships.userId, userId));
    expect(memberships).toHaveLength(1);

    const schools = await db.select().from(schema.schools).where(eq(schema.schools.id, school.id));
    expect(schools).toHaveLength(1);
  });

  it('auth.users → public.users FK behavior is unchanged (rejects unknown auth identity)', async () => {
    await expect(db.insert(schema.users).values({ id: randomUUID() })).rejects.toThrow();
  });
});

describe('schools — tenant', () => {
  it('creates a school with sensible defaults', async () => {
    const [school] = await db.insert(schema.schools).values({ name: 'École Al Noor' }).returning();

    expect(school.id).toBeDefined();
    expect(school.status).toBe('ACTIVE');
    expect(school.timezone).toBe('UTC');
  });
});

describe('school_memberships — User ↔ School', () => {
  it('connects a user to a school', async () => {
    const userId = await createUser();
    const school = await createSchool();

    const [membership] = await db
      .insert(schema.schoolMemberships)
      .values({ schoolId: school.id, userId, role: 'TEACHER' })
      .returning();

    expect(membership.schoolId).toBe(school.id);
    expect(membership.userId).toBe(userId);
    expect(membership.role).toBe('TEACHER');
    expect(membership.status).toBe('ACTIVE');
  });

  it('rejects a duplicate membership for the same user and school', async () => {
    const userId = await createUser();
    const school = await createSchool();

    await db.insert(schema.schoolMemberships).values({ schoolId: school.id, userId, role: 'TEACHER' });

    await expect(
      db.insert(schema.schoolMemberships).values({ schoolId: school.id, userId, role: 'TEACHER' }),
    ).rejects.toThrow();
  });

  it('allows one user to belong to multiple schools', async () => {
    const userId = await createUser();
    const firstSchool = await createSchool('School A');
    const secondSchool = await createSchool('School B');

    await db.insert(schema.schoolMemberships).values({ schoolId: firstSchool.id, userId, role: 'TEACHER' });
    const [second] = await db
      .insert(schema.schoolMemberships)
      .values({ schoolId: secondSchool.id, userId, role: 'TEACHER' })
      .returning();

    expect(second.schoolId).toBe(secondSchool.id);
  });

  it('allows different users to belong to the same school', async () => {
    const firstUser = await createUser();
    const secondUser = await createUser();
    const school = await createSchool();

    await db.insert(schema.schoolMemberships).values({ schoolId: school.id, userId: firstUser, role: 'TEACHER' });
    const [second] = await db
      .insert(schema.schoolMemberships)
      .values({ schoolId: school.id, userId: secondUser, role: 'PARENT' })
      .returning();

    expect(second.userId).toBe(secondUser);
  });

  it('rejects a STUDENT role membership', async () => {
    const userId = await createUser();
    const school = await createSchool();

    await expect(
      db
        .insert(schema.schoolMemberships)
        .values({ schoolId: school.id, userId, role: 'STUDENT' as never }),
    ).rejects.toThrow();
  });

  it('deactivates a membership without deleting its historical row', async () => {
    const userId = await createUser();
    const school = await createSchool();
    const [membership] = await db
      .insert(schema.schoolMemberships)
      .values({ schoolId: school.id, userId, role: 'TEACHER' })
      .returning();

    const [updated] = await db
      .update(schema.schoolMemberships)
      .set({ status: 'INACTIVE' })
      .where(eq(schema.schoolMemberships.id, membership.id))
      .returning();

    expect(updated.status).toBe('INACTIVE');

    const remaining = await db
      .select()
      .from(schema.schoolMemberships)
      .where(eq(schema.schoolMemberships.id, membership.id));
    expect(remaining).toHaveLength(1);
  });
});

describe('foreign-key constraints', () => {
  it('rejects a membership pointing to a non-existent school', async () => {
    const userId = await createUser();

    await expect(
      db
        .insert(schema.schoolMemberships)
        .values({ schoolId: randomUUID(), userId, role: 'TEACHER' }),
    ).rejects.toThrow();
  });

  it('rejects a membership pointing to a non-existent user', async () => {
    const school = await createSchool();

    await expect(
      db
        .insert(schema.schoolMemberships)
        .values({ schoolId: school.id, userId: randomUUID(), role: 'TEACHER' }),
    ).rejects.toThrow();
  });

  it('restricts deleting a school that still has memberships', async () => {
    const userId = await createUser();
    const school = await createSchool();
    await db.insert(schema.schoolMemberships).values({ schoolId: school.id, userId, role: 'TEACHER' });

    await expect(db.delete(schema.schools).where(eq(schema.schools.id, school.id))).rejects.toThrow();
  });

  it('restricts deleting a user that still has memberships', async () => {
    const userId = await createUser();
    const school = await createSchool();
    await db.insert(schema.schoolMemberships).values({ schoolId: school.id, userId, role: 'TEACHER' });

    await expect(db.delete(schema.users).where(eq(schema.users.id, userId))).rejects.toThrow();
  });
});