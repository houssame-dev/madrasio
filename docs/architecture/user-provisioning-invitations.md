# User Provisioning and Invitations

## Boundary and identity model

Task 045 adds School-administered account access for existing Teacher and Parent profiles. Supabase Auth remains the authentication authority; Drizzle and the application database remain the authorization authority. The invariant is one `auth.users` identity, the same UUID in one `public.users` row, and zero or more SchoolMembership rows. Students never receive application accounts in V1.

ADR-019 supplies the deterministic lookup projection. Submitted email is trimmed and lowercased, then looked up by exact `public.users.email`. A found User is reusable only after `auth.admin.getUserById(user.id)` confirms that the exact Auth identity exists and its normalized Auth email equals the stored projection. Missing identities or email drift return `ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED`; SchoolAdmin provisioning never repairs drift or scans Auth users.

## Teacher and Parent flows

The narrow actions are:

- `POST /api/v1/teachers/:id/invite-account` with `{ "email": "..." }`, deriving role `TEACHER`.
- `POST /api/v1/parents/:id/invite-account` with `{ "email": "..." }`, deriving role `PARENT`.

Both derive the current School and caller from `requireCurrentContext`, then enforce the existing `teachers.manage` or `parents.manage` permission. The body is strict and cannot select `schoolId`, `userId`, role, membership state, or permissions. A foreign profile is indistinguishable from not found. Only an ACTIVE, currently unlinked profile is eligible for a new invitation.

The profile form and account-access operation remain separate. Normal Teacher and Parent forms no longer expose raw User UUID input; a School administrator uses the profile detail's account-access section. Backend `userId` compatibility remains for controlled internal/bootstrap use, but it is not the product linking path.

## New email

For an email absent from `public.users`, the server-only Auth Admin client calls `inviteUserByEmail`. The returned UUID and email are validated. One PostgreSQL transaction then creates the canonical `public.users` row, the current-School membership with the endpoint-derived role, and the profile link.

Auth and PostgreSQL do not share a distributed transaction. If the database transaction fails, the service attempts to delete only the Auth identity created by that request. It never deletes an existing identity. Failed compensation returns `ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED` and requires an operator to reconcile the partial state. An invitation email may already have left Supabase before successful compensation; that link can subsequently be unusable.

## Existing-user reuse and conflicts

For a verified existing identity:

- no current-School membership: create the endpoint-derived membership and link the profile;
- an ACTIVE membership with the same role: reuse it and link without duplication;
- an incompatible or inactive current-School membership: fail closed; no role/status is silently changed;
- another same-kind profile already linked to the identity: fail closed for operator reconciliation;
- memberships in other Schools: leave them unchanged and do not disclose them.

This enables one human account to belong to multiple Schools. It does not create one account per School or encode role/School authority in Auth metadata.

## Idempotency and partial state

A retry after successful provisioning finds the profile already linked, verifies its application/Auth identity and current-School membership again, and returns `ALREADY_LINKED` without sending another invite. A retry with a different email receives `PROFILE_ACCOUNT_ALREADY_LINKED`. Concurrent database writes lock the exact application User/profile rows within the transaction, then use the existing unique User-email and School/User membership constraints plus a conditional profile update. The locks are transaction-scoped and work through the transaction pooler; there is no session state or in-memory mutex.

Controlled feature codes are `PROFILE_NOT_FOUND`, `PROFILE_NOT_ACTIVE`, `PROFILE_ACCOUNT_ALREADY_LINKED`, `ACCOUNT_ROLE_CONFLICT`, `ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED`, `ACCOUNT_INVITE_FAILED`, and `ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED`. Provider messages, SQL details, Auth metadata, and other-School details are not returned.

## Secret boundary

`SUPABASE_SERVICE_ROLE_KEY` is read only in `lib/auth/admin.ts`, a `server-only` module. Its client disables session persistence, token refresh, and URL-session detection. It is used only for Auth Admin identity operations, never for browser configuration or ordinary application database queries. Drizzle continues to use `DATABASE_URL`. No `NEXT_PUBLIC_*` variable contains Auth Admin authority.

## Invitation confirmation and password setup

The STAGING Invite User template must route its `TokenHash` and fixed type `invite` to:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite
```

The server route accepts only `type=invite`, calls the cookie-aware SSR client's `verifyOtp`, and redirects to `/auth/set-password`. It ignores arbitrary `next` input and removes the token hash from the next URL. Invalid or expired links receive generic recovery copy.

The password page requires the cookie-backed invite session. React Hook Form and Zod require matching passwords of 8–128 characters; Supabase remains authoritative for any stronger project password policy. `auth.updateUser({ password })` sets the password. Success clears browser query state, enters `/dashboard`, and lets `/me` resolve role, School, and profile scope from application data. Passwords and token hashes are never logged.

## Signup, delivery, and resend policy

Public signup and anonymous sign-in remain disabled. The trusted Auth Admin invite is the only new-identity production path. Built-in Supabase mail delivery is sufficient for application semantics but can be rate-limited or restricted to approved addresses. Custom SMTP is Task 047.

Task 045 does not provide resend. Re-inviting, delete/recreate, or exposing an Auth action link is unsafe as a generic retry policy. A controlled resend design using the later mail-delivery infrastructure is deferred to Task 047. A guarded `generateLink({ type: "invite" })` may be used only by explicit STAGING acceptance tooling when built-in delivery blocks testing; it is never returned by these application APIs.

## Deployment handoff

Before hosted use, `APP_URL`, Supabase Auth Site URL, allowed redirects, and the invite template must name only the approved origin. Local STAGING acceptance uses `http://localhost:3000`. Task 046 defines the dedicated `school-management-system-staging` Vercel project and its stable HTTPS callback contract in `vercel-staging-and-cicd.md`; provider acceptance must replace/add that exact origin without arbitrary wildcard Internet origins. Production is not configured by this task.

No migration, RLS change, Data API change, public directory, generalized identity-provider table, or Student account path is introduced by Task 045.

## STAGING verification

The guarded Task 045 operator verifier reruns the standard hosted preflight before doing any work: the exact STAGING project, runtime and operator pool modes, 15-entry migration journal, 39-table schema, disabled public/anonymous signup, and unavailable application-table Data API must all pass. It then uses a separate Task 045 Parent profile and account; the original Task 042 Admin, Teacher, and Parent fixtures are not changed.

The application flow was verified through the real STAGING Auth and PostgreSQL services: canonical profile creation, application authorization, one Auth/public identity, one endpoint-derived PARENT membership, exact profile linkage, a no-op provisioning retry, token-hash verification by the server confirmation route, cookie-backed password setup, dashboard access, logout, password sign-in, `/me` School/role resolution, self Parent-profile scope, and staff-route denial. The resulting safe aggregate state is four application Users and four memberships (one SchoolAdmin, one Teacher, and two Parents); Student/Auth identity matches remain zero.

No operator inbox was available to inspect a delivered message without exposing account data, so acceptance used the explicitly guarded STAGING-only `generateLink({ type: "invite" })` adapter. The token stayed in process memory, was never logged or returned by an application route, and exercised the same `verifyOtp` confirmation and password/session path. Production SchoolAdmin routes always use `inviteUserByEmail`; `generateLink` is not part of their runtime dependency. Built-in delivery and resend remain the Task 047 SMTP boundary.
