import { and, eq, isNull, ne } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@school/database';

import { findUserByNormalizedEmail } from '@/lib/auth/user-repository';

import type { ProfileKind } from '../domain/contracts';

export type ProvisioningDb = NodePgDatabase<typeof schema>;

export async function findProfile(
  db: ProvisioningDb,
  schoolId: string,
  kind: ProfileKind,
  profileId: string,
) {
  if (kind === 'TEACHER') {
    const [row] = await db.select({
      id: schema.teachers.id, userId: schema.teachers.userId, status: schema.teachers.status,
    }).from(schema.teachers).where(and(
      eq(schema.teachers.schoolId, schoolId), eq(schema.teachers.id, profileId),
    )).limit(1);
    return row ?? null;
  }
  const [row] = await db.select({
    id: schema.parents.id, userId: schema.parents.userId, status: schema.parents.status,
  }).from(schema.parents).where(and(
    eq(schema.parents.schoolId, schoolId), eq(schema.parents.id, profileId),
  )).limit(1);
  return row ?? null;
}

export async function findUserByEmail(db: ProvisioningDb, email: string) {
  return findUserByNormalizedEmail(db, email);
}

export async function findUser(db: ProvisioningDb, id: string) {
  const [row] = await db.select({
    id: schema.users.id, email: schema.users.email, status: schema.users.status,
  }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return row ?? null;
}

export async function findMembership(db: ProvisioningDb, schoolId: string, userId: string) {
  const [row] = await db.select().from(schema.schoolMemberships).where(and(
    eq(schema.schoolMemberships.schoolId, schoolId), eq(schema.schoolMemberships.userId, userId),
  )).limit(1);
  return row ?? null;
}

export async function findOtherLinkedProfile(
  db: ProvisioningDb,
  schoolId: string,
  kind: ProfileKind,
  profileId: string,
  userId: string,
) {
  if (kind === 'TEACHER') {
    const [row] = await db.select({ id: schema.teachers.id }).from(schema.teachers).where(and(
      eq(schema.teachers.schoolId, schoolId), eq(schema.teachers.userId, userId),
      ne(schema.teachers.id, profileId),
    )).limit(1);
    return row ?? null;
  }
  const [row] = await db.select({ id: schema.parents.id }).from(schema.parents).where(and(
    eq(schema.parents.schoolId, schoolId), eq(schema.parents.userId, userId),
    ne(schema.parents.id, profileId),
  )).limit(1);
  return row ?? null;
}

async function lockUser(db: ProvisioningDb, userId: string) {
  const rows = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.id, userId)).for('update');
  if (!rows[0]) throw new Error('IDENTITY_RECONCILIATION_REQUIRED');
}

async function lockProfile(
  db: ProvisioningDb,
  schoolId: string,
  kind: ProfileKind,
  profileId: string,
) {
  if (kind === 'TEACHER') {
    await db.select({ id: schema.teachers.id }).from(schema.teachers).where(and(
      eq(schema.teachers.schoolId, schoolId), eq(schema.teachers.id, profileId),
    )).for('update');
  } else {
    await db.select({ id: schema.parents.id }).from(schema.parents).where(and(
      eq(schema.parents.schoolId, schoolId), eq(schema.parents.id, profileId),
    )).for('update');
  }
}

export async function linkExistingIdentity(
  db: ProvisioningDb,
  input: {
    schoolId: string;
    profileId: string;
    kind: ProfileKind;
    userId: string;
    requireExistingMembership?: boolean;
  },
): Promise<'LINKED' | 'ALREADY_LINKED'> {
  return db.transaction(async (tx) => {
    await lockUser(tx as ProvisioningDb, input.userId);
    await lockProfile(tx as ProvisioningDb, input.schoolId, input.kind, input.profileId);
    const profile = await findProfile(tx as ProvisioningDb, input.schoolId, input.kind, input.profileId);
    if (!profile) throw new Error('PROFILE_NOT_FOUND');
    if (profile.userId && profile.userId !== input.userId) throw new Error('PROFILE_LINK_CONFLICT');
    if (await findOtherLinkedProfile(
      tx as ProvisioningDb, input.schoolId, input.kind, input.profileId, input.userId,
    )) throw new Error('PROFILE_LINK_CONFLICT');

    const membership = await findMembership(tx as ProvisioningDb, input.schoolId, input.userId);
    if (membership) {
      if (membership.status !== 'ACTIVE') throw new Error('MEMBERSHIP_RECONCILIATION_REQUIRED');
      if (membership.role !== input.kind) throw new Error('MEMBERSHIP_ROLE_CONFLICT');
    } else {
      if (input.requireExistingMembership) throw new Error('MEMBERSHIP_RECONCILIATION_REQUIRED');
      await tx.insert(schema.schoolMemberships).values({
        schoolId: input.schoolId, userId: input.userId, role: input.kind, status: 'ACTIVE',
      });
    }

    if (profile.userId === input.userId) return 'ALREADY_LINKED';

    const table = input.kind === 'TEACHER' ? schema.teachers : schema.parents;
    const result = await tx.update(table).set({ userId: input.userId, updatedAt: new Date() })
      .where(and(eq(table.schoolId, input.schoolId), eq(table.id, input.profileId), isNull(table.userId)))
      .returning({ id: table.id, userId: table.userId });
    if (result[0]?.userId !== input.userId) throw new Error('PROFILE_LINK_CONFLICT');
    return 'LINKED';
  });
}

export async function createAndLinkIdentity(
  db: ProvisioningDb,
  input: { schoolId: string; profileId: string; kind: ProfileKind; userId: string; email: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockProfile(tx as ProvisioningDb, input.schoolId, input.kind, input.profileId);
    const profile = await findProfile(tx as ProvisioningDb, input.schoolId, input.kind, input.profileId);
    if (!profile || profile.userId) throw new Error('PROFILE_LINK_CONFLICT');
    if (await findUserByEmail(tx as ProvisioningDb, input.email)) throw new Error('IDENTITY_ALREADY_EXISTS');
    await tx.insert(schema.users).values({ id: input.userId, email: input.email, status: 'ACTIVE' });
    await tx.insert(schema.schoolMemberships).values({
      schoolId: input.schoolId, userId: input.userId, role: input.kind, status: 'ACTIVE',
    });
    const table = input.kind === 'TEACHER' ? schema.teachers : schema.parents;
    const linked = await tx.update(table).set({ userId: input.userId, updatedAt: new Date() }).where(and(
      eq(table.schoolId, input.schoolId), eq(table.id, input.profileId), isNull(table.userId),
    )).returning({ id: table.id });
    if (!linked[0]) throw new Error('PROFILE_LINK_CONFLICT');
  });
}
