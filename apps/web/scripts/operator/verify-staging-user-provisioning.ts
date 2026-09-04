import { createHash } from 'node:crypto';

import { createServerClient } from '@supabase/ssr';
import { createClient, type User } from '@supabase/supabase-js';
import * as schema from '@school/database';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { postgresConnectionConfig } from '@school/database/connection';

import { normalizeEmail } from '@/lib/auth/email';
import { provisionProfileAccount } from '@/lib/modules/user-provisioning';

import { consoleLogger, parseSeedConfig } from './contracts';
import { createOperatorRuntime } from './runtime';

const FIXTURE_CODE = 'TASK045-PAR-001';
const EXPECTED_PROJECT_REF = 'cqeaxlttezunirsmkrxz';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixtureEmail(adminEmail: string): string {
  const [mailbox, domain] = normalizeEmail(adminEmail).split('@');
  assert(mailbox && domain, 'TASK_045_FIXTURE_EMAIL_UNAVAILABLE');
  return `${mailbox.replace(/\+.*$/, '')}+task045-parent@${domain}`;
}

function fixturePassword(serviceKey: string): string {
  return `T45!${createHash('sha256').update(`task-045:${serviceKey}`).digest('hex').slice(0, 28)}aA`;
}

type CookieRecord = { name: string; value: string; options?: Record<string, unknown> };

function cookieStore() {
  const values = new Map<string, CookieRecord>();
  return {
    values,
    adapter: {
      getAll: () => [...values.values()].map(({ name, value }) => ({ name, value })),
      setAll: (cookies: CookieRecord[]) => {
        for (const cookie of cookies) values.set(cookie.name, cookie);
      },
    },
    header: () => [...values.values()].map(({ name, value }) => `${name}=${value}`).join('; '),
    absorb(response: Response) {
      const headers = response.headers as Headers & { getSetCookie?: () => string[] };
      for (const raw of headers.getSetCookie?.() ?? []) {
        const pair = raw.split(';', 1)[0];
        const separator = pair.indexOf('=');
        if (separator > 0) {
          values.set(pair.slice(0, separator), {
            name: pair.slice(0, separator), value: pair.slice(separator + 1),
          });
        }
      }
    },
  };
}

async function requestJson(
  url: string,
  cookies: ReturnType<typeof cookieStore>,
  init?: RequestInit,
) {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', cookie: cookies.header(), ...init?.headers },
    redirect: 'manual',
  });
  cookies.absorb(response);
  const body = await response.json().catch(() => null) as unknown;
  return { response, body };
}

async function main(): Promise<void> {
  assert(process.env.RUN_STAGING_USER_PROVISIONING === '1', 'TASK_045_HOSTED_OPT_IN_REQUIRED');
  const config = parseSeedConfig(process.env);
  assert(new URL(config.SUPABASE_URL).hostname.startsWith(EXPECTED_PROJECT_REF), 'STAGING_TARGET_NOT_CONFIRMED');
  const appUrl = process.env.APP_URL;
  assert(appUrl === 'http://localhost:3000', 'TASK_045_LOCAL_APP_REQUIRED');

  const operator = createOperatorRuntime(config);
  const pool = new Pool({ ...postgresConnectionConfig(config.DATABASE_URL, process.env.DATABASE_SSL_CA), max: 3 });
  const db = drizzle(pool, { schema });
  try {
    await operator.preflight();

    const admin = createClient(config.SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const adminLogin = await admin.auth.signInWithPassword({
      email: config.BOOTSTRAP_ADMIN_EMAIL,
      password: config.BOOTSTRAP_ADMIN_PASSWORD,
    });
    assert(!adminLogin.error && adminLogin.data.user, 'TASK_045_ADMIN_LOGIN_FAILED');
    const adminId = adminLogin.data.user.id;
    await admin.auth.signOut({ scope: 'local' });

    const [membership] = await db.select({ schoolId: schema.schoolMemberships.schoolId })
      .from(schema.schoolMemberships).where(and(
        eq(schema.schoolMemberships.userId, adminId),
        eq(schema.schoolMemberships.role, 'SCHOOL_ADMIN'),
        eq(schema.schoolMemberships.status, 'ACTIVE'),
      )).limit(1);
    assert(membership, 'TASK_045_ADMIN_MEMBERSHIP_MISSING');

    const adminCookies = cookieStore();
    const adminSsr = createServerClient(config.SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      cookies: adminCookies.adapter,
    });
    const signedIn = await adminSsr.auth.signInWithPassword({
      email: config.BOOTSTRAP_ADMIN_EMAIL, password: config.BOOTSTRAP_ADMIN_PASSWORD,
    });
    assert(!signedIn.error, 'TASK_045_ADMIN_SSR_LOGIN_FAILED');

    let [profile] = await db.select({ id: schema.parents.id, userId: schema.parents.userId })
      .from(schema.parents).where(and(
        eq(schema.parents.schoolId, membership.schoolId),
        eq(schema.parents.parentCode, FIXTURE_CODE),
      )).limit(1);
    if (!profile) {
      const created = await requestJson(`${appUrl}/api/v1/parents`, adminCookies, {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'Task 045', lastName: 'Invitation Fixture', parentCode: FIXTURE_CODE,
        }),
      });
      assert(created.response.status === 201, 'TASK_045_PROFILE_CREATE_FAILED');
      const data = (created.body as { data?: { id?: string } } | null)?.data;
      assert(data?.id, 'TASK_045_PROFILE_CREATE_RESPONSE_INVALID');
      profile = { id: data.id, userId: null };
    }

    const email = fixtureEmail(config.BOOTSTRAP_ADMIN_EMAIL);
    const password = fixturePassword(config.SUPABASE_SECRET_KEY);
    const authAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    let inviteTokenHash: string | undefined;
    const guardedFallback = {
      async getUserById(id: string): Promise<User | null> {
        const result = await authAdmin.auth.admin.getUserById(id);
        if (result.error?.status === 404) return null;
        if (result.error) throw result.error;
        return result.data.user;
      },
      async inviteUserByEmail(inviteEmail: string, redirectTo: string): Promise<User> {
        const result = await authAdmin.auth.admin.generateLink({
          type: 'invite', email: inviteEmail, options: { redirectTo },
        });
        if (result.error) throw result.error;
        inviteTokenHash = result.data.properties.hashed_token;
        return result.data.user;
      },
      async deleteUser(id: string): Promise<void> {
        const result = await authAdmin.auth.admin.deleteUser(id);
        if (result.error) throw result.error;
      },
    };

    const first = await provisionProfileAccount({
      db,
      authAdmin: guardedFallback,
      inviteRedirectTo: `${appUrl}/auth/confirm`,
    }, { userId: adminId, schoolId: membership.schoolId }, 'PARENT', profile.id, { email });
    const retry = await provisionProfileAccount({
      db,
      authAdmin: guardedFallback,
      inviteRedirectTo: `${appUrl}/auth/confirm`,
    }, { userId: adminId, schoolId: membership.schoolId }, 'PARENT', profile.id, { email });
    assert(first.userId === retry.userId && retry.state === 'ALREADY_LINKED', 'TASK_045_RETRY_NOT_IDEMPOTENT');

    if (inviteTokenHash) {
      const invitedCookies = cookieStore();
      const confirmation = await fetch(
        `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(inviteTokenHash)}&type=invite`,
        { redirect: 'manual' },
      );
      invitedCookies.absorb(confirmation);
      assert(confirmation.status === 307, 'TASK_045_CONFIRMATION_FAILED');
      assert(confirmation.headers.get('location') === `${appUrl}/auth/set-password`, 'TASK_045_CONFIRMATION_REDIRECT_INVALID');
      assert(invitedCookies.values.size > 0, 'TASK_045_CONFIRMATION_SESSION_MISSING');
      const setupPage = await fetch(`${appUrl}/auth/set-password`, {
        headers: { cookie: invitedCookies.header() },
      });
      assert(setupPage.ok && (await setupPage.text()).includes('Set your password'), 'TASK_045_PASSWORD_PAGE_FAILED');
      const invitedSsr = createServerClient(config.SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        cookies: invitedCookies.adapter,
      });
      const updated = await invitedSsr.auth.updateUser({ password });
      assert(!updated.error && updated.data.user?.id === first.userId, 'TASK_045_PASSWORD_UPDATE_FAILED');
      const dashboard = await fetch(`${appUrl}/dashboard`, { headers: { cookie: invitedCookies.header() } });
      assert(dashboard.ok, 'TASK_045_DASHBOARD_FAILED');
      const logout = await fetch(`${appUrl}/api/v1/auth/logout`, {
        method: 'POST', headers: { cookie: invitedCookies.header() }, redirect: 'manual',
      });
      assert(logout.ok, 'TASK_045_LOGOUT_FAILED');
    }

    const userCookies = cookieStore();
    const userSsr = createServerClient(config.SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      cookies: userCookies.adapter,
    });
    const passwordLogin = await userSsr.auth.signInWithPassword({ email, password });
    assert(!passwordLogin.error && passwordLogin.data.user?.id === first.userId, 'TASK_045_PASSWORD_LOGIN_FAILED');
    const me = await requestJson(`${appUrl}/api/v1/me`, userCookies);
    const meData = (me.body as { data?: { currentSchool?: { role?: string; id?: string } } } | null)?.data;
    assert(me.response.ok && meData?.currentSchool?.role === 'PARENT', 'TASK_045_ME_ROLE_FAILED');
    assert(meData.currentSchool.id === membership.schoolId, 'TASK_045_ME_SCHOOL_FAILED');
    const selfProfiles = await requestJson(`${appUrl}/api/v1/me/parent-profiles`, userCookies);
    const profileRows = (selfProfiles.body as { data?: Array<{ parent?: { id?: string } }> } | null)?.data;
    assert(selfProfiles.response.ok && profileRows?.length === 1, 'TASK_045_PARENT_SCOPE_FAILED');
    assert(profileRows[0]?.parent?.id === profile.id, 'TASK_045_PARENT_PROFILE_SCOPE_FAILED');
    const staffDenied = await requestJson(`${appUrl}/api/v1/teachers`, userCookies);
    assert(staffDenied.response.status === 403, 'TASK_045_PARENT_STAFF_DENIAL_FAILED');

    const [counts, linked, users] = await Promise.all([
      db.execute(sql`
        select
          (select count(*)::int from users) as users,
          (select count(*)::int from school_memberships) as memberships,
          (select count(*)::int from school_memberships where role = 'SCHOOL_ADMIN') as school_admins,
          (select count(*)::int from school_memberships where role = 'TEACHER') as teachers,
          (select count(*)::int from school_memberships where role = 'PARENT') as parents,
          (select count(*)::int from teachers where user_id is not null) as linked_teachers,
          (select count(*)::int from teachers where user_id is null) as unlinked_teachers,
          (select count(*)::int from parents where user_id is not null) as linked_parents,
          (select count(*)::int from parents where user_id is null) as unlinked_parents
      `),
      db.select({ userId: schema.parents.userId }).from(schema.parents)
        .where(eq(schema.parents.id, profile.id)).limit(1),
      authAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    assert(linked[0]?.userId === first.userId, 'TASK_045_PROFILE_LINK_FAILED');
    assert(!users.error, 'TASK_045_AUTH_AUDIT_FAILED');
    const studentIds = new Set((await db.select({ id: schema.students.id }).from(schema.students)).map((row) => row.id));
    const studentAuthCount = users.data.users.filter((user) => studentIds.has(user.id)).length;
    assert(studentAuthCount === 0, 'TASK_045_STUDENT_AUTH_INVARIANT_FAILED');
    consoleLogger.info('task_045_hosted_verification_passed', {
      profileType: 'PARENT', role: 'PARENT', linked: true,
      accepted: true, passwordLogin: true, retryIdempotent: true,
      ...(counts.rows[0] as Record<string, number>),
      authIdentities: users.data.users.length,
      studentAuthCount,
    });
  } finally {
    await pool.end();
    await operator.close();
  }
}

main().catch((error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'featureCode' in error
    ? String((error as { featureCode: unknown }).featureCode)
    : error instanceof Error && /^TASK_045_[A-Z_]+$/.test(error.message)
      ? error.message
      : 'TASK_045_HOSTED_VERIFICATION_FAILED';
  consoleLogger.error(code);
  process.exitCode = 1;
});
