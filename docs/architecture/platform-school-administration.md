# Minimal platform School administration — Task 058

## Authority review

Before Task 058, SUPER_ADMIN existed only in `membership_role` and the School
permission map. User had identity/email/lifecycle but no independent platform
authority. Reusing membership would require a fake School or confuse tenant
authority with platform authority. ADR-023 adds only
`users.is_platform_admin BOOLEAN NOT NULL DEFAULT false`.

Migration 0017 grants nobody access, including existing SUPER_ADMIN memberships.
Bootstrap and Teacher/Parent/Admin provisioning default to false. Initial platform
operator designation is a separate reviewed security action, not a public grant
endpoint, Auth metadata claim, email allowlist or automatic bootstrap promotion.
No designation or hosted migration occurred in A1.

`requirePlatformAuthority` checks the server-authenticated identity against an
ACTIVE application User and this flag. Platform services recheck authority at
their boundary and in mutation transactions. School roles grant nothing here.
Normal School authorization is unchanged: membership, selected School, role,
permissions and relationships remain mandatory. Platform users with real School
memberships use those memberships normally. Legacy SUPER_ADMIN memberships
remain School-scoped; the new flag provides no blanket tenant bypass.

## Workspace and API

`/platform/schools` and `/platform/schools/[schoolId]` have an independent
server-protected layout outside the School AppBootstrap layout. The workspace
shows School identity/status/timezone and Admin memberships, not tenant-private
academic records or an impersonated dashboard.

`/me` adds `platformAuthority: SUPER_ADMIN` only for designated operators. It
does not replace the current School role or expose a global email directory.
Platform-only users arriving at `/dashboard` get a platform link, not a fake
School selection. Ordinary users do not receive platform navigation.

Routes under `/api/v1/platform/schools`:

- GET: deterministic School list, 50 per page; POST: create School.
- GET `/{schoolId}`: School management summary.
- GET `/{schoolId}/admins`: Admin memberships including inactive history.
- POST `/{schoolId}/admins`: email-only invite/link, fixed SCHOOL_ADMIN role.
- PATCH `/{schoolId}/admins/{membershipId}`: ACTIVE or INACTIVE only.

Identity comes only from the verified session. Strict bodies reject userId,
schoolId overrides, role, permissions, platform authority and passwords. UUID
validation and School-bound membership lookups prevent mismatched targets.
Responses are private/no-store. Email visibility is limited to this authorized
School Admin management read model.

## Provisioning and lifecycle

Create School first, then add Admins. Name is nonblank, timezone uses shared IANA
validation and the existing schema default UTC. No demo data is made. School
creation and audit are atomic; failed invitations never delete the School.

Teacher/Parent and School Admin provisioning share `withProvisionedIdentity`:
trim/lowercase application email lookup; exact Auth UUID/email verification before
reuse; `inviteUserByEmail` for new identities only; fixed configured `/auth/confirm`
callback; compensation restricted to the newly invited identity if application
persistence fails. No Auth scans, passwords, public signup, duplicate identity
model, or automatic email-drift repairs are introduced.

New User + SCHOOL_ADMIN membership + audit commit together. Email delivery is
not atomic with Postgres: an invitation may precede DB rollback and compensating
Auth deletion. Cleanup failure requires operator reconciliation. Provider failures
are controlled; no automatic delivery retries occur.

Existing active same-School Admin membership is a no-op: no duplicate, email or
false success audit. Inactive membership requires explicit reactivation. A
different School role is a conflict, never a silent role change. Other School
memberships stay untouched. School/identity locks and `(school_id,user_id)`
uniqueness serialize membership operations. Multiple active Admins are supported.

Deactivation preserves identity and history. Reactivation verifies active User,
matching Auth identity, active School and the existing SCHOOL_ADMIN relationship;
it updates that row instead of recreating it. No approved last-admin invariant
was found: **deactivating the last active Admin is permitted**, explicitly noted
in the UI. A platform operator can reactivate an eligible membership later.

Expired invitations/password recovery use Task 057 `/auth/recover`. No second
reset service or automatic resend is added. Teacher/Parent recovery assistance
remains unchanged. Real provider delivery is outside A1 validation.

## Audit and UI

Closed PLATFORM actions: `SchoolCreated`, `SchoolAdminMembershipEstablished`,
`SchoolAdminMembershipDeactivated`, `SchoolAdminMembershipReactivated`.
Actor is the session User; `school_id` is null per PLATFORM schema semantics;
School UUID is bounded metadata. Resource is School or SchoolMembership.
Mutation and audit commit/rollback together. Metadata excludes emails, passwords,
tokens and provider details. Denied/no-op operations produce no success event.

UI reuses MANAGEMENT_WIDE/FORM_DETAIL, Field, FormActions, InlineFeedback,
StatusBadge, Pagination, React Hook Form/Zod and TanStack Query. Pending actions
disable submission; mutation retries are disabled. Only relevant platform queries
are invalidated, never another user's session or the entire query cache.

## Persistence and verification

Drizzle-generated `0017_platform-authority`: migrations 17 → 18; application
tables 40 → 40; recovery tables 42 → 42. Recovery format, ordering and allowlist
stay unchanged. Full-row fingerprints include the new User column. Migration
metadata and deployment/operator preflight expectations advance.

Focused local tests cover fresh replay, populated upgrade with false defaults,
no implicit promotion, preserved membership rows, RLS/grants/no policies, and
nonempty recovery row replay including a designated operator and PLATFORM audit
with all 42 fingerprints equal. This is not hosted/pg_dump/age evidence.

A1 uses synthetic local databases and mocked Auth. A2 canonical validation,
hosted migration, operator designation, CI, commit and push remain separate gates.
