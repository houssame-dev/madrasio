# First STAGING Platform Super Admin operator procedure

Status: local runner prepared under TASK_058_STAGING_PLATFORM_ADMIN_IMPLEMENT_02.
No real account has been invited or designated by this checkpoint. ADR-023 and
the existing `/platform/schools` authorization boundary remain authoritative.
School membership is neither required nor a source of platform authority.

## Separate approval and execution gates

The prepared command is `pnpm --filter @school/web exec tsx scripts/operator/staging-platform-admin.ts MODE`.
It has **not** been executed against STAGING. Never use `bootstrap:first-tenant`:
that workflow creates a School and membership. Never run this command against Production.
Use a reviewed checkout, installed dependencies and a clean, controlled child environment;
do not load ambient dotenv files, executable preloads or public secret configuration.

1. Separately authorize read-only `preflight`. Reverify the exact STAGING target,
   all 23 migration hashes/timestamps through 0022, 43 application tables, authority
   column and existing database security audit. Historical zero-admin counts are
   not authorization or a substitute for this fresh inspection.
2. Obtain owner-supplied dedicated recipient details and approval. `prepare-invite`
   performs read-only checks and exclusively creates an external local receipt.
   It sends nothing. Existing Auth/application identities or designated admins fail closed.
3. Separately authorize **one** `invite` invocation and set
   `PLATFORM_ADMIN_CONFIRMATION=INVITE_STAGING_PLATFORM_ADMIN`. The runner records
   `invitation-attempted` before calling Auth Admin once. It never adopts, deletes,
   resends to or overwrites an existing account. Retain the returned Auth UUID.
4. The recipient completes the existing invitation confirmation and password setup
   flow and signs in. Verify the intended identity with the owner out of band.
5. Separately authorize **one** `designate` invocation and set
   `PLATFORM_ADMIN_CONFIRMATION=DESIGNATE_STAGING_PLATFORM_ADMIN`. Supply the exact
   recorded UUID. Provider and Auth-table UUID/email, invitation, creation time,
   confirmed email, sign-in, configured password and non-anonymous/non-banned/non-deleted state must agree.
   SQL returns only a password-present boolean, never a password hash. Invitation
   confirmation alone creates a session and therefore is insufficient setup evidence.
   Any existing application User is rejected unless the exact audited operation
   is already complete. School membership, Teacher or Parent links reject designation.
6. Separately authorize read-only `verify`, then real authenticated application
   acceptance of `/platform/schools`. Local tests do not prove hosted readiness,
   email delivery, password strength/setup, or real browser/platform acceptance.

## Private inputs and receipt custody

Supply values privately through a sanitized environment, never command arguments,
source, logs or `NEXT_PUBLIC_` variables. General `preflight` requires only these input **names**:

- `PLATFORM_ADMIN_TARGET_ENV` (`staging`), `STAGING_EXPECTED_PROJECT_REF`
- `MIGRATION_DATABASE_URL`, `DATABASE_SSL_CA`

It reads readiness and aggregate administrator counts, without looking up a recipient,
constructing an Auth client or accessing/creating a receipt. If `SUPABASE_URL` is
supplied, its exact STAGING origin is still validated. No recipient or correlation
UUID is needed for this general inspection.

All identity-specific modes (`prepare-invite`, `invite`, `designate`, `verify`)
additionally require:

- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APP_URL`
- `PLATFORM_ADMIN_EMAIL`
- `PLATFORM_ADMIN_OPERATION_ID`, `PLATFORM_ADMIN_AUTHORIZATION_ID` (owner correlation UUIDs)
- `PLATFORM_ADMIN_RECEIPT_PATH` (absolute path in an existing private external directory)
- `PLATFORM_ADMIN_AUTH_USER_ID` (required for designate/verify; omit before invitation)
- `PLATFORM_ADMIN_CONFIRMATION` (mutation-specific confirmation above)

The fixed project is `cqeaxlttezunirsmkrxz`; Auth origin is that project's HTTPS
origin. Database target must be its `postgres.PROJECT_REF` session-pooler user,
EU-central-1 Supabase pooler, port 5432, database postgres, with verified TLS and
an explicitly supplied trusted CA. URL query overrides are rejected. Redirect
is fixed to `https://madrasio-staging.vercel.app/auth/confirm`; verify the existing
STAGING Auth redirect/email settings in a separately authorized preflight.

Keep operation and authorization correlation UUIDs constant across this operation;
the owner must separately approve invitation and designation under that record.
The UUID is a correlation reference, not a cryptographic authorization token.
Do not place emails, passwords, tokens or credentials in the receipt. Its strict
schema contains only version, fixed project, correlation UUIDs, timestamp, stage,
an operation-bound recipient digest and optional Auth UUID. The digest detects
accidental recipient changes across modes; it is not encryption or authorization.
Treat receipts as private identity records. Protect the directory with operator-only OS ownership/ACLs
(Windows ACL review is an operator prerequisite); do not share the same identity
with another concurrent provisioning procedure. The runner rejects repository
storage, symlinked final receipts, oversized/invalid/mismatched receipts and
concurrent mutation leases. It does not establish OS administrator trust or
protect a receipt directory writable by an attacker.

Receipt stages are prepared → invitation-attempted → invited →
designation-attempted → complete. Durable exclusive creation precedes invitation;
updates use a flushed temporary file and same-directory rename. An exclusive
`.lock` prevents concurrent runner sends. A crash can leave that lock or a `.tmp`
file: preserve all evidence and stop for reconciliation, never auto-remove it.
Storage/OS power-loss durability must be reviewed by the operator; loss or
tampering of a receipt is not permission to start another operation.

## Atomic designation and failure behavior

Only the exact new dedicated User is inserted ACTIVE with platform authority.
A short transaction takes a self-conflicting `SHARE ROW EXCLUSIVE` lock on users,
then rechecks readiness, counts and identity with an Auth-row share lock. No
network request occurs under that lock. Statement/lock/connection timeouts bound
waiting; the table lock briefly excludes other User writers. This is a one-time
operator operation, not an application-wide authorization lock.

The same transaction appends `PlatformAdminDesignated`, PLATFORM scope, SYSTEM
actor `STAGING_PLATFORM_ADMIN_OPERATOR`, null School/actor User, exact User resource,
and only operation/authorization UUID metadata. Audit failure rolls back the User
insert. Existing School-management audit service and all ordinary authorization
remain unchanged. No School/profile/membership is created.

An exact matching User **and** audit result is a read-only no-op on repeat.
Another administrator, collision, inactive/conflicting User or uncertain state
stops. No provider mutation, transaction or failed commit is automatically retried.
A lost commit acknowledgement leaves `designation-attempted`; read-only verification
may establish exact completion. Otherwise reconcile manually under separate
authorization. Never compensate by deleting an Auth User or resetting a receipt.
Transport failures print fixed sanitized codes only, without raw provider/SQL
errors, stack traces, bodies, email or secret values.

The provider call and database commit cannot be atomic together. External concurrent
Auth administrators remain an operational race; stop conflicting identity operations
and review identity/time/receipt correspondence. Hosted configuration, real
multi-session PostgreSQL lock contention and invitation delivery require separate
STAGING evidence. This prepared procedure does not itself grant platform authority.
