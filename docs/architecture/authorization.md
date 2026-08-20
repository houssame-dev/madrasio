# Authorization Foundation

> Task 005 — reusable, server-side authorization foundation for V1.

This document describes the implemented authorization foundation. It is an
implementation companion to `CLAUDE.md` §13–§16, `docs/architecture/overview.md`
§16 and the accepted ADRs (ADR-007, ADR-008, ADR-009, ADR-005, ADR-018). It does
not rewrite the architecture documentation and does not define the final V1
permission matrix.

---

## 1. Location

```
apps/web/lib/
├── auth/            Supabase session → authenticated User ID (identity only)
├── authorization/
│   ├── roles.ts                 V1 roles (no Student role)
│   ├── permissions.ts           stable identifiers + Role → Permission map
│   ├── decisions.ts             ALLOW / DENY + machine-readable reasons
│   ├── context.ts               CurrentContext (identity + membership + school)
│   ├── requirements.ts          optional stages an operation requests
│   ├── pipeline.ts              canonical evaluation order (pure)
│   ├── facade.ts                can() / authorize() / error mapping
│   ├── can.tsx                  UX-only Can component
│   └── server/                  Drizzle-backed resolvers (context + scope)
├── context/         thin facade exposing CurrentContext resolution
└── db/              Drizzle client (schema-registered)
```

Authorization rules belong ONLY in this boundary (CLAUDE.md §15). They never
live in React components, Route Handlers, random utilities, or schema files.

## 2. Context

`CurrentContext` carries only what the pipeline needs (Task 005 §16):

- `userId` — the authenticated application User ID (shared UUID, ADR-018)
- `userActive` — active application user flag
- `membership` — the resolved SchoolMembership (schoolId + status)
- `schoolContext` — the School Context summary
- `role` — the membership role
- `scope` — resolved scope facts (filled on demand)

Large domain objects are NOT placed in the context. `resolveCurrentContext`
(`lib/authorization/server`) resolves identity + membership + school context
from `school_memberships`; a client-provided `schoolId` is never trusted alone.

## 3. Pipeline

The canonical order is fixed (CLAUDE.md §15):

```
Authenticated User → Active User → Valid School Membership → Current School
Context → Role → Permission → Academic Scope → Ownership / Relationship →
Resource State → ALLOW / DENY
```

`evaluateAuthorization(context, requirements)` is pure and never throws.
Identity/membership/school stages always run; permission, scope, ownership and
resource-state stages run only when the operation requests them.

## 4. Roles & Permissions

- Roles: `SUPER_ADMIN`, `SCHOOL_ADMIN`, `TEACHER`, `PARENT`. No `STUDENT`.
- Permissions are stable identifiers (e.g. `students.manage`, `grades.enter`,
  `grades.publish`). Only the minimal foundation set is defined.
- `ROLE_PERMISSIONS` is the single, deterministic Role → Permission map.
  `SUPER_ADMIN` is a platform-level placeholder mapping to the full set; all
  school-scoped operations still require a valid, active membership + context.

## 5. Scope

- Teacher scope comes ONLY from `TeacherAssignment` (ADR-009); the engine
  requires an ACTIVE assignment matching Class + Subject + AcademicYear.
- Parent scope comes ONLY from `ParentStudent` (BR-PARENT-002); the engine
  requires an ACTIVE relationship. The enrollment/academic-context refinement
  is a later module-level policy.
- Ended assignments/relationships never grant current scope.

## 6. Ownership / Relationship / Resource State

Modules resolve these facts against their own data and pass them in
(`OwnershipRequirement`, `ResourceStateRequirement`); the engine enforces them
in pipeline order. E.g. a teacher with `grades.enter` + correct scope is still
DENIED when the resource state forbids the action (Gradebook CLOSED).

## 7. Server API

```ts
const decision = await authorizeOperation(db, { userId, schoolId }, requirements);
await requireOperation(db, { userId, schoolId }, requirements); // throws AppError
```

`requireOperation` maps `UNAUTHENTICATED` → 401 and everything else → 403.
Modules that must hide resource existence may map `OUT_OF_SCOPE`/`NOT_OWNER`
to 404 instead; the foundation defaults to 403 and never leaks the internal
reason.

## 8. Frontend

`can()` / `authorize()` / the `Can` component and `roleHasPermission` are UX
helpers only (hide buttons/navigation). The server is always authoritative.

## 9. Known placeholders

- User-level lifecycle now exists: `public.users.status` (`user_status` enum,
  ACTIVE / SUSPENDED / DISABLED, default ACTIVE — Task 014.1). `userActive` is
  derived from it everywhere: `lib/auth` enforces the Active User stage first
  (`assertUserActive`, `requireCurrentContext`), and the legacy
  `resolveCurrentContext` also reads `users.status` so the pipeline's
  `USER_INACTIVE` stage is genuinely reachable on every authorization path.
  See `docs/architecture/authentication-context.md` §4.
- The full module-by-module permission matrix and SUPER_ADMIN platform
  workflows are product decisions deferred to the relevant module tasks.