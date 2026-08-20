# `lib/auth`

Supabase Auth integration + server-side Current Context resolution boundary
(Task 014).

This folder owns:
- Session retrieval (`server-auth.ts`, `session.ts`)
- Cookie handling for SSR (`current-school.ts`)
- Current User identity (`server-auth.ts`)
- Current School Context resolution (`current-context.ts`, `require-context.ts`)
- Auth-stage errors (`auth-errors.ts`)

The canonical protected-entry point is `requireCurrentContext(db)` (see
`require-context.ts`) — it resolves auth identity → application User →
global User lifecycle (ACTIVE, Task 014.1) → ACTIVE membership → current
School → role, then returns the authorization foundation's `CurrentContext`.

It does NOT own authorization decisions (role/scope/ownership). Authorization
lives in `lib/authorization/`.

Full login/recovery/registration UI flows will be added in a dedicated
Authentication UI task; the server contracts built here are stable and
framework-agnostic.