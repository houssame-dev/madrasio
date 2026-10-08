# Safe account recovery (Task 057)

## Minimum V1 lifecycle

Supabase owns password reset, expiry, token verification and session creation. The
application never creates reset tokens, shares passwords, deletes/recreates an
identity, or changes memberships/profile relationships to recover access. ADR-018
and ADR-019 UUID/email identity invariants remain unchanged.

Public `/auth/recover` submits `{email}` to `POST /api/v1/auth/recovery`. Valid
addresses are trimmed/lowercased using the shared normalization helper and passed
to `resetPasswordForEmail`. There is no application User lookup or account-dependent
response branch. Known, unknown, ineligible and provider-rejected requests all receive
HTTP 200 `{data:{state:"REQUESTED"}}`, private/no-store. Malformed input receives the
same envelope without sending. No arbitrary redirect option is accepted. Generic
confirmation instructions persist; they do not promise delivery. Provider latency is
not equalized, and no constant-time network guarantee is claimed.

The dedicated server-only delivery adapter uses the publishable key (not an Auth
Admin secret), disables session persistence/refresh and URL-session detection, and
performs no automatic retries. No reusable application rate limiter exists in the
current repository. Public recovery delegates email/project/IP throttling and
eligibility to [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).
Server-mediated requests share the server's provider IP budget; untrusted forwarded
IP headers are not passed as rate-limit authority. Provider 429/error details are
never returned. This is not a CAPTCHA or a guarantee against distributed abuse.

## Pending and expired invitations

Existing invitation provisioning still returns an already-linked no-op on retry.
It does not resend. Recovery uses the existing identity via the supported
[password recovery API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail),
including unconfirmed invited email identities. Supabase's recovery implementation
looks up an existing email identity; it does not create a replacement user. The
application does not infer whether an old token has expired: that is provider state.
The reviewed [Supabase recovery verifier](https://github.com/supabase/auth/blob/master/internal/api/verify.go)
confirms an unconfirmed existing user on successful recovery verification. This source
check is compatibility evidence, not a claim about the deployed provider version.
An expired invite link directs the owner to request recovery. Activated identities
use the same recovery path. No `inviteUserByEmail`, `generateLink`, signup, delete,
email change or password-setting Admin operation is used for recovery.

Local tests model pending, expired-link and confirmed identities. Actual delivered
recovery for both an unconfirmed invite and a confirmed account remains a separately
authorized hosted acceptance requirement; Task 057 A1 makes no hosted claim.

## School administrator assistance

`POST /api/v1/teachers/:id/recover-account` and the Parent equivalent accept only
an empty object. The server derives caller and School from current context and
requires `teachers.manage` / `parents.manage`. Existing SchoolAdmin and permitted
SuperAdmin **current-School membership** authority applies; there is no platform
bypass or new Task 058 workspace. Teacher and Parent callers are denied.

The profile must belong to that School, be ACTIVE and already linked to an ACTIVE
application User with an ACTIVE same-School membership of exactly TEACHER/PARENT.
Conflicting roles, inactive/unlinked profiles, absent membership and duplicate
same-kind links fail closed. The exact User UUID is verified with
`auth.admin.getUserById`; missing identity or normalized email drift returns
`ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED` without repair or disclosure of the
conflicting email. No arbitrary email/User/role/School/password is accepted.

Active linked profile detail screens expose a single recovery action. They do not
display the email, give the administrator a password field, or clear unrelated
query caches. Account-owner recovery is global to the identity, while assistance
authority is School-scoped. Other-School memberships and relationships are untouched.

## Audit, concurrency and delivery uncertainty

`AccountRecoveryRequested` is a SCHOOL/USER intent event: actor is the authenticated
administrator; resource type is `User`; resource UUID is the affected application
User. Strict metadata contains only `profileKind`, `profileId`, and verified Auth
`identityState` (`CONFIRMED`/`UNCONFIRMED`). No email, password, token, URL or provider
payload is recorded. Anonymous requests do not create audit rows.

The transaction locks the affected User, rejects an intent recorded during the last
60 seconds, rechecks eligibility, and commits the audit **before** external delivery.
The identity lock serializes concurrent assisted requests, including requests from
different Schools, without returning their details. Audit failure rolls back the
intent and prevents delivery. A committed intent reserves the cooldown even when
delivery fails. No application identity state is mutated. This intentionally favors
bounded duplicate delivery over immediate retry after a timeout.

`ACCOUNT_RECOVERY_INELIGIBLE`, `ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED`,
`ACCOUNT_RECOVERY_COOLDOWN` (429), `ACCOUNT_RECOVERY_DELIVERY_UNCERTAIN` and the existing
`AUDIT_PERSISTENCE_FAILED` are controlled errors. Delivery failure retains intent;
there is no automatic compensation or retry. An event proves authorized initiation,
not delivery or successful reset. After cooldown, an explicit new attempt is allowed;
provider rate limits still apply. The UI disables duplicate pending/success clicks.

Postgres and Supabase email are not atomic. Membership/email can change after the
last check and before provider execution; the app cannot recall mail already sent.
Recovery never grants tenant access: subsequent `/me` authorization uses current
application identity/membership state. Email drift is never silently repaired.

## Callback and password safety

`APP_URL` supplies the fixed canonical origin, never request Host/forwarded headers
or query input. HTTPS is required except intentional localhost development. The
callback is exactly `/auth/confirm`; only `invite` and `recovery` types are accepted.
The cookie-aware server client verifies `token_hash` with `verifyOtp`, requires a
returned session and redirects to fixed `/auth/set-password`, removing the hash.
`next`/`redirectTo`, including protocol-relative and encoded values, are ignored.
Invalid/expired verification is generic and private/no-store; hashes are not logged.

Password setup requires server-verified Auth session, not application membership,
so an invited identity can finish setup. The shared Task 052 form remains POST,
disabled before hydration, `autocomplete=new-password`, RHF/Zod validated, and uses
only session-scoped `updateUser({password})`. No URL/storage/log password handling
is introduced. Success clears that user's query cache and returns to dashboard
bootstrap; `/me` remains authoritative. Provider/transport failures are sanitized.
Public recovery uses Task 056 labeled fields, associated errors and first-invalid
focus; security-sensitive next steps stay visible.

## Separate provider acceptance handoff

No provider configuration or real email was used in A1. Before hosted acceptance,
read back the actual Reset Password template and approved origin/redirect allowlist.
Required [Supabase template](https://supabase.com/docs/guides/auth/auth-email-templates)
link shape (the caller passes the full callback URL):

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery
```

Do not append `/auth/confirm` twice or use a fragment-only recovery link for SSR.
The existing Invite User template stays `type=invite`. A template change, if needed,
requires separate provider authorization; do not claim recovery is operational
until delivered-email/cookie/password-login acceptance passes. Signup/anonymous
sign-in, SMTP, password policy, Auth keys and hosted URLs are unchanged by A1.

Auth recovery email is provider-managed authentication, not a domain Notification;
it does not create or directly process application Outbox/Notification rows. Existing
bootstrap creates the first verified administrator through its operator-only path;
recovery does not invoke bootstrap or extend it into platform account management.

No schema/dependency/environment-variable additions: 17 migrations, 40 application
tables, 42 recovery tables. Task 057 A2 canonical validation is a separate gate.
