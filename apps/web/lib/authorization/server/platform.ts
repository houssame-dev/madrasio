import 'server-only';
import { eq } from 'drizzle-orm';
import { users } from '@school/database';
import type { AuthDb } from '@/lib/auth/current-context';
import { ForbiddenError, UnauthenticatedError } from '@/lib/errors';

/** Identity is session-derived by adapters. School roles and client claims grant nothing here. */
export async function requirePlatformAuthority(db: AuthDb, userId: string | null) {
  if (!userId) throw new UnauthenticatedError();
  const [user] = await db
    .select({ id: users.id, status: users.status, allowed: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || user.status !== 'ACTIVE' || !user.allowed) throw new ForbiddenError();
  return { userId: user.id };
}
