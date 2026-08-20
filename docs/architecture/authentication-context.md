# Authentication & Current School Context

> Task 014 — turns the committed Supabase Auth + User + SchoolMembership
> foundation into a real application/session context used by APIs.

This document describes the implemented server-side authentication / current
context layer. It is an implementation companion to `CLAUDE.md` §5/§13–§16,
`docs/architecture/overview.md` §15/§16, the accepted ADRs (ADR-005, ADR-007,
ADR-017, ADR-018) and the domain rules BR-AUTH-001/002/004/005, BR-SCHOOL-002/003/
004 and BR-ROLE-001/002.

---

## 1. Supabase Auth identity

Supabase Auth is the authoritative identity provider (ADR-005). The server
resolves the authenticated auth User from the request session via
`supabase.auth.getUser()` (the approved server-side operation — no custom JWT
decoding). The client is NEVER trusted to provide `userId`, `role`,
`permissions`, or membership status; the server derives all of them.

Because ADR-018 states `public.users.id = auth.users.id`, there is NO identity
mapping table. `lib/auth/server-auth.ts` (`getAuthenticatedUser` /
`getAuthenticatedUserId`) resolves the auth User id; the same UUID is the
application User primary key.

## 2. Canonical flow

```
Supabase Auth Session
        ↓
Authenticated auth.users.id
        ↓
public.users                       (APPLICATION_USER_NOT_FOUND when missing)
        ↓
SchoolMemberships                 (role + status from the membership row)
        ↓
Current School Context            (selected cookie validated / auto-single)
        ↓
Role                               (from the ACTIVE membership)
        ↓
Permissions                        (lib/authorization)
        ↓
Academic/relationship scope when required   (on demand, lib/authorization)
```

## 3. Server session resolution

`lib/auth/server-auth.ts` owns identity only:

- `defaultSessionResolver` — verified Supabase session → `{ id } | null`.
- `getAuthenticatedUser(resolver?)` / `getAuthenticatedUserId(resolver?)` —
  throw `UnauthenticatedError` (401) when there is no valid session. The
  resolver is injectable so tests drive real PGlite resolution without a
  Supabase network dependency.

## 4. Application User & active state

After obtaining `auth.users.id`, the layer loads `public.users` by that id
(`resolveUserContext`). If the row is missing the server returns a controlled
`AuthError('APPLICATION_USER_NOT_FOUND')` (403) — a provisioning state. The
server NEVER silently auto-creates application User rows during protected
requests; provisioning is an explicit onboarding flow (a future task).

**User lifecycle (Task 014.1):** `public.users.status` is the authoritative
global application User lifecycle, backed by the `user_status` enum:

- `ACTIVE` — normal application operation allowed, subject to membership and
  authorization.
- `SUSPENDED` — current application operation denied globally; historical
  records remain.
- `DISABLED` — current application operation denied globally; historical
  records remain.

Key invariants:

- `userActive` in the CurrentContext is derived from DB state
  (`userStatus === 'ACTIVE'`), never hardcoded.
- Deactivation is a LIFECYCLE state, never destructive deletion: changing the
  status deletes nothing — memberships, teacher/parent profiles, results,
  announcements, notifications and historical authorship all remain.
- Global User lifecycle is DISTINCT from SchoolMembership lifecycle. Both must
  pass: `users.status = ACTIVE` AND an ACTIVE membership in the requested
  School.
- It applies to ALL roles including SUPER_ADMIN — no exemptions, and no
  platform-global powers are introduced.

Canonical flow (CLAUDE.md §15) becomes:

```
Supabase authenticated identity
        ↓
public.users exists            (APPLICATION_USER_NOT_FOUND when missing)
        ↓
public.users.status = ACTIVE   (USER_INACTIVE when SUSPENDED/DISABLED)
        ↓
ACTIVE SchoolMembership
        ↓
Current School Context
        ↓
Role
        ↓
Permission / scope / relationship / state
```

The Active User stage is enforced by `assertUserActive` in
`lib/auth/current-context.ts` and is run FIRST by `requireCurrentContext`,
`selectCurrentSchool`, and the `/me` route — before any membership/role/
permission/scope evaluation. The legacy `resolveCurrentContext`
(`lib/authorization/server`) also reads `users.status` so the engine's
`USER_INACTIVE` stage is genuinely reachable on every authorization path.

## 5. School memberships

Membership is the authoritative User ↔ School ↔ Role ↔ status source
(`school_memberships`, role enum SUPER_ADMIN/SCHOOL_ADMIN/TEACHER/PARENT). Role
is never duplicated on `public.users` and is never derived from Teacher/Parent
profiles. Historical/inactive memberships are never deleted — they remain
stored and are returned (but only ACTIVE rows can become the current School).

## 6. Current School selection semantics

`lib/auth/current-context.ts` (`resolveUserContext`) derives the single
operational current School:

1. An explicitly selected School is used ONLY when it is an ACTIVE membership
   (`selectedSchoolSource: 'selected'`).
2. Exactly one ACTIVE membership with no valid selection → auto-selected
   (`'auto-single'`, Task 014 §20 convenience).
3. Two or more ACTIVE memberships with no valid selection → NO guessing; the
   current School stays null and school-scoped protected operations throw
   `SCHOOL_CONTEXT_REQUIRED` (Task 014 §8/§22).
4. Zero ACTIVE memberships → authenticated but no current School Context
   (`/me` returns `currentSchool: null`; never treated as unauthenticated,
   Task 014 §21).

Selection is deterministic and never inferred from first-DB-row, role, teacher
profile, parent profile, or an arbitrary request-body value.

## 7. Current School selector storage (cookie)

`lib/auth/current-school.ts` manages a server-managed, HTTP-only cookie
(`sms_current_school`) containing ONLY the selected `school_id`:

- HTTP-only, SameSite=Lax (same-site application), Secure in production,
  `path: /`, cleared with `maxAge: 0`.
- Role/permissions/membership status are NEVER stored in the cookie.
- Malformed values are normalized to null on read and re-validated against the
  ACTIVE membership table on every request.

**The cookie is a SELECTOR, never proof of authorization.** Every request
re-validates: cookie schoolId + authenticated user + ACTIVE SchoolMembership
(Task 014 §18/§32). `clearSelectedSchoolId()` is the logout companion — the
future logout flow must also clear this cookie (Task 014 §29).

## 8. Multi-School users & role changes

A User may belong to multiple Schools (`school_memberships` is many-to-many,
BR-SCHOOL-002). One operational School is resolved at a time. Role comes from
the CURRENT ACTIVE membership row: switching from School A (SCHOOL_ADMIN) to
School B (TEACHER) yields role TEACHER — never a cached SCHOOL_ADMIN role
(Task 014 §31).

## 9. Canonical protected entry point

`lib/auth/require-context.ts` — `requireCurrentContext(db, deps?)`:

```
Supabase session → authenticated User id
  → application User (APPLICATION_USER_NOT_FOUND when missing)
  → current School selector validated against ACTIVE membership
  → CurrentContext (identity + membership + school + role)
```

It throws `UnauthenticatedError` (401) / `AuthError` (403) and returns the
authorization foundation's `CurrentContext` (scope intentionally empty —
resolved on demand by `lib/authorization/server`). It owns NO role/permission
logic. A protected route derives `userId` + `schoolContext.schoolId` from this
context and passes them to module use cases, which re-run the canonical
pipeline against fresh DB state.

## 10. Authorization integration

The layer feeds the EXISTING pipeline (`lib/authorization`); it creates no
parallel auth system. The canonical order is preserved:

```
Authenticated → Active/valid User → Membership → School Context → Role →
Permission → Academic Scope → Ownership/Relationship → Resource State →
ALLOW/DENY
```

Teacher/Parent scope remains exclusively assignment/relationship based and is
resolved ON DEMAND — never eagerly loaded into the request context (Task 014
§11/§15). The integration proof (test `__tests__/auth/integration.test.ts`)
shows a real resolved context driving `publishResult` end-to-end.

## 11. API contracts

`GET /api/v1/me` — safe current-user payload:

```json
{
  "data": {
    "user": { "id": "..." },
    "currentSchool": { "id": "...", "role": "..." } | null,
    "memberships": [
      { "schoolId": "...", "schoolName": "...", "role": "...", "status": "ACTIVE" }
    ]
  }
}
```

- `memberships` is the V1 ACTIVE-only selector list (documented choice, Task 014
  §17): current-school selection must only allow ACTIVE memberships, and
  historical/inactive rows are not exposed to the `/me` payload in V1 (an
  account-management view may add an explicit historical query later).
- No session tokens, credentials, service-role keys, password hashes, or auth
  metadata are ever exposed (Task 014 §35).

`POST /api/v1/me/current-school` — request `{ "schoolId": "uuid" }`:

1. resolve authenticated User
2. enforce the global User lifecycle FIRST — a SUSPENDED/DISABLED User is denied
   (403 `USER_INACTIVE`) even when the requested membership is ACTIVE
   (Task 014.1 §8)
3. load/verify membership for `schoolId`, require ACTIVE
   (inactive/foreign/nonexistent → 403 `INVALID_SCHOOL_CONTEXT`)
4. persist the selected `school_id` in the HTTP-only cookie
5. return the new `/me` context

Role/permission/membership status are never accepted from the client.

`GET /api/v1/me` for a globally inactive User returns a controlled
`USER_INACTIVE` denial (403) — never an operational School Context, even when
memberships are ACTIVE (Task 014.1 §7).

Invalid selection behavior is safe (Task 014 §19): a stale/invalid selector is
normalized away, cleared from consideration, and — when exactly one ACTIVE
membership exists — falls back to that membership; otherwise a protected
operation requires explicit selection (`SCHOOL_CONTEXT_REQUIRED`). A valid
cookie never bypasses User status: the Active User stage runs before School
authorization on every request (Task 014.1 §9).

## 12. Errors

Controlled, machine-readable `featureCode`s layered on `FORBIDDEN` (403),
matching the existing module error pattern and `toApiErrorResponse`:

| featureCode | Meaning |
|---|---|
| `UNAUTHENTICATED` | No valid Supabase session (401) |
| `APPLICATION_USER_NOT_FOUND` | Auth identity without an application User row |
| `USER_INACTIVE` | Application User is globally SUSPENDED/DISABLED (denied before membership/role/permission/scope) |
| `SCHOOL_CONTEXT_REQUIRED` | School-scoped op without a resolvable current School |
| `INVALID_SCHOOL_CONTEXT` | Explicitly selected/requested School is not an ACTIVE membership |

`UNAUTHENTICATED` comes from the existing `UnauthenticatedError`; the other
four are `AuthError` instances (`lib/auth/auth-errors.ts`). Raw Supabase /
Postgres errors are never exposed.

## 13. Middleware / session-refresh decision

No middleware exists today and NONE is added by this task. Rationale:

- Route Handlers already use the request-scoped `getServerSupabase()` client,
  and the committed flows resolve identity server-side per request.
- No Server Component / protected page reads the session yet (no UI in this
  task), so the main benefit of `updateSession`-style middleware (refresh on
  navigation) is not yet needed.
- Adding middleware now would impose a hard Supabase env dependency on EVERY
  request and risk breaking unauthenticated pages/e2e (no brittle external
  Supabase dependency in CI, Task 014 §45).

A minimal session-refresh middleware is documented as a candidate for the
Authentication UI milestone, when protected SSR reads exist. Middleware will
NEVER be an authorization source — role/membership state can change, so
protected operations always resolve server context through authoritative DB
state (Task 014 §28).

## 14. No Student role / no UI

V1 roles remain SUPER_ADMIN, SCHOOL_ADMIN, TEACHER, PARENT. No STUDENT role was
introduced (BR-AUTH-002). This task builds stable server/application contracts
only — no login page, school selector component, navbar, profile page, or
dashboard (Task 014 §47). The future login/logout UI flow must also clear the
current-school cookie on logout.

## 15. What was NOT changed

- No migration (schema unchanged — `users`, `schools`, `school_memberships`
  reused as-is).
- No new queue/infrastructure, no caching of context (Redis/session caching
  explicitly avoided; a request resolves context once and passes it on,
  Task 014 §25).
- No changes to the authorization pipeline or the module use cases (one focused
  integration proof only, Task 014 §36).