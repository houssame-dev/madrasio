import 'server-only';
import { and, count, eq } from 'drizzle-orm';
import { schools, schoolMemberships, users } from '@school/database';
import type { AuthDb } from '@/lib/auth/current-context';
import type { AuthAdminPort } from '@/lib/auth/admin';
import { requirePlatformAuthority } from '@/lib/authorization/server/platform';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { recordPlatformAudit } from '@/lib/audit/platform';
import {
  withProvisionedIdentity,
  verifyApplicationIdentity,
  identityReconciliation,
} from '../user-provisioning/application/identity';
import { ProvisioningError } from '../user-provisioning/application/provisioning-errors';
import { schoolInput, adminInput, membershipInput, platformId, platformPage } from './contracts';

const schoolFields = {
  id: schools.id,
  name: schools.name,
  status: schools.status,
  timezone: schools.timezone,
};
function id(value: string) {
  const parsed = platformId.safeParse(value);
  if (!parsed.success) throw new ValidationError('Invalid resource identifier.');
  return parsed.data;
}
async function school(db: AuthDb, schoolId: string, lock = false) {
  const query = db
    .select(schoolFields)
    .from(schools)
    .where(eq(schools.id, id(schoolId)));
  const [row] = await (lock ? query.for('update') : query);
  if (!row) throw new NotFoundError();
  return row;
}
function active(row: { status: string }) {
  if (row.status !== 'ACTIVE') throw new ConflictError('The School must be active.');
}

export async function listPlatformSchools(db: AuthDb, actorId: string | null, page = 1) {
  await requirePlatformAuthority(db, actorId);
  const parsed = platformPage.safeParse(page);
  if (!parsed.success) throw new ValidationError('Invalid page.');
  const data = await db
    .select(schoolFields)
    .from(schools)
    .orderBy(schools.name, schools.id)
    .limit(50)
    .offset((parsed.data - 1) * 50);
  const [total] = await db.select({ value: count() }).from(schools);
  return { data, meta: { page: parsed.data, pageSize: 50, total: total.value } };
}
export async function openPlatformSchool(db: AuthDb, actorId: string | null, schoolId: string) {
  await requirePlatformAuthority(db, actorId);
  return school(db, schoolId);
}
export async function createPlatformSchool(db: AuthDb, actorId: string | null, input: unknown) {
  await requirePlatformAuthority(db, actorId);
  const parsed = schoolInput.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid School details.');
  return db.transaction(async (tx) => {
    await requirePlatformAuthority(tx, actorId);
    const [created] = await tx.insert(schools).values(parsed.data).returning(schoolFields);
    await recordPlatformAudit(tx, actorId, {
      action: 'SchoolCreated',
      resourceId: created.id,
      metadata: { schoolId: created.id },
    });
    return created;
  });
}
export async function listSchoolAdmins(db: AuthDb, actorId: string | null, schoolId: string) {
  await openPlatformSchool(db, actorId, schoolId);
  return db
    .select({
      id: schoolMemberships.id,
      userId: users.id,
      email: users.email,
      status: schoolMemberships.status,
      userStatus: users.status,
    })
    .from(schoolMemberships)
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .where(
      and(eq(schoolMemberships.schoolId, schoolId), eq(schoolMemberships.role, 'SCHOOL_ADMIN')),
    )
    .orderBy(schoolMemberships.createdAt, schoolMemberships.id);
}
export type AdminDependencies = { db: AuthDb; authAdmin: AuthAdminPort; inviteRedirectTo: string };
export async function establishSchoolAdmin(
  deps: AdminDependencies,
  actorId: string | null,
  schoolId: string,
  input: unknown,
) {
  active(await openPlatformSchool(deps.db, actorId, schoolId));
  const parsed = adminInput.safeParse(input);
  if (!parsed.success) throw new ValidationError('Provide only a valid email address.');
  const outcome = await withProvisionedIdentity(deps, parsed.data.email, async (identity) =>
    deps.db.transaction(async (tx) => {
      await requirePlatformAuthority(tx, actorId);
      active(await school(tx, schoolId, true));
      if (identity.created)
        await tx.insert(users).values({ id: identity.id, email: identity.email });
      const [user] = await tx.select().from(users).where(eq(users.id, identity.id)).for('update');
      if (!user || user.status !== 'ACTIVE' || user.email !== identity.email)
        identityReconciliation();
      const [existing] = await tx
        .select()
        .from(schoolMemberships)
        .where(
          and(eq(schoolMemberships.schoolId, schoolId), eq(schoolMemberships.userId, identity.id)),
        );
      if (existing) {
        if (existing.role !== 'SCHOOL_ADMIN')
          throw new ProvisioningError(
            'ACCOUNT_ROLE_CONFLICT',
            'The account has an incompatible role in this School.',
          );
        if (existing.status !== 'ACTIVE')
          throw new ConflictError('Use explicit membership reactivation.');
        return { membershipId: existing.id, state: 'ALREADY_LINKED' as const };
      }
      const [membership] = await tx
        .insert(schoolMemberships)
        .values({ schoolId, userId: identity.id, role: 'SCHOOL_ADMIN' })
        .returning();
      await recordPlatformAudit(tx, actorId, {
        action: 'SchoolAdminMembershipEstablished',
        resourceId: membership.id,
        metadata: { schoolId },
      });
      return {
        membershipId: membership.id,
        state: identity.created ? ('INVITED' as const) : ('LINKED' as const),
      };
    }),
  );
  return outcome.result;
}
export async function changeSchoolAdminStatus(
  deps: Pick<AdminDependencies, 'db' | 'authAdmin'>,
  actorId: string | null,
  schoolId: string,
  membershipId: string,
  input: unknown,
) {
  await openPlatformSchool(deps.db, actorId, schoolId);
  id(membershipId);
  const parsed = membershipInput.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid membership status.');
  // Provider verification is read-only and outside the application transaction.
  const [target] = await deps.db
    .select({ id: users.id, email: users.email, status: users.status })
    .from(schoolMemberships)
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.id, membershipId),
        eq(schoolMemberships.role, 'SCHOOL_ADMIN'),
      ),
    );
  if (!target) throw new NotFoundError();
  if (parsed.data.status === 'ACTIVE') await verifyApplicationIdentity(deps.authAdmin, target);
  return deps.db.transaction(async (tx) => {
    await requirePlatformAuthority(tx, actorId);
    const currentSchool = await school(tx, schoolId, true);
    if (parsed.data.status === 'ACTIVE') active(currentSchool);
    const [user] = await tx.select().from(users).where(eq(users.id, target.id)).for('update');
    if (
      parsed.data.status === 'ACTIVE' &&
      (!user || user.status !== 'ACTIVE' || user.email !== target.email)
    )
      identityReconciliation();
    const [membership] = await tx
      .select()
      .from(schoolMemberships)
      .where(
        and(
          eq(schoolMemberships.schoolId, schoolId),
          eq(schoolMemberships.id, membershipId),
          eq(schoolMemberships.userId, target.id),
          eq(schoolMemberships.role, 'SCHOOL_ADMIN'),
        ),
      )
      .for('update');
    if (!membership) throw new NotFoundError();
    if (membership.status === parsed.data.status)
      return { id: membership.id, status: membership.status };
    await tx
      .update(schoolMemberships)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(schoolMemberships.id, membership.id));
    await recordPlatformAudit(tx, actorId, {
      action:
        parsed.data.status === 'ACTIVE'
          ? 'SchoolAdminMembershipReactivated'
          : 'SchoolAdminMembershipDeactivated',
      resourceId: membership.id,
      metadata: { schoolId },
    });
    return { id: membership.id, status: parsed.data.status };
  });
}
