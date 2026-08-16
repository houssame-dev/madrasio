# ADR-018: Shared UUID Between Supabase Auth User and Application User

- Status: Accepted
- Date: 2026-08-15

## Context

Supabase Auth stores authenticated users in the `auth.users` table.

The application also needs its own User record for domain/application-level information.

Maintaining two independent UUIDs would introduce an unnecessary identity mapping:

Supabase Auth User UUID
        ↓
Application User UUID
        ↓
Mapping Table

This adds complexity without providing a current V1 benefit.

## Decision

The Application User primary key MUST be the same UUID as the corresponding Supabase Auth user ID.

Conceptually:

auth.users.id
      │
      │ same UUID
      ▼
public.users.id

The application `users.id` references `auth.users.id`.

The relationship must use:

- UUID
- Primary Key on application users.id
- Foreign Key to auth.users.id
- ON DELETE CASCADE where appropriate

## Responsibilities

Supabase Auth owns:

- Authentication identity
- Credentials
- Sessions
- Authentication identities

The application owns:

- Application User profile
- School Membership
- Roles
- Permissions
- Domain relationships

Authentication identity and application authorization remain separate concerns.

## Consequences

### Positive

- No identity mapping table is required.
- `auth.uid()` maps directly to `users.id`.
- Authorization queries become simpler.
- Foreign-key integrity is straightforward.
- Application records naturally follow Auth user lifecycle.

### Negative

- Application User lifecycle is coupled to Supabase Auth identity.
- Changing authentication providers later requires an explicit migration strategy.

## Constraints

The application must never store passwords or Supabase Auth credentials in `public.users`.

Supabase service-role credentials remain server-only.

The application `users` table must not attempt to replace `auth.users`.

## Implementation

The `auth` schema and `auth.users` table are owned and managed by Supabase.

The application schema references the existing `auth.users` table via the
official `authUsers` reference exported by `drizzle-orm/supabase` instead of
declaring an application-owned copy of the table.

The `authUsers` reference is deliberately NOT exported from the Drizzle schema
entrypoint, so `drizzle-kit generate` never emits `CREATE SCHEMA "auth"`,
`CREATE TABLE "auth"."users"`, or any other Supabase Auth-owned object.
Generated migrations create only application-owned objects
(`public.users`, `public.schools`, `public.school_memberships`, enums,
indexes, constraints) while still declaring the foreign key:

- `public.users.id` → `auth.users.id` ON DELETE CASCADE
- `school_memberships.user_id` → `users.id` ON DELETE RESTRICT
- `school_memberships.school_id` → `schools.id` ON DELETE RESTRICT

Referential deletion behavior:

- Deleting an auth user cascades to the application `users` row, which is the
  expected identity lifecycle (the auth identity no longer exists).
- A `users` row that still has `school_memberships` cannot be deleted
  (RESTRICT), protecting tenant membership history.
- A `school` that still has `school_memberships` cannot be deleted (RESTRICT).

Normal lifecycle uses state, not deletion:

- Membership deactivation (`status = INACTIVE`) preserves the historical row.
- `school_memberships` rows are the historical User ↔ School record and must
  remain traceable.

Test environments that need the Supabase-managed auth objects (for example
PGlite) create a Supabase-compatible `auth` schema / `auth.users` as explicit
test-only infrastructure, kept clearly separate from the production migration.
This mirrors what a real Supabase project already contains and does not weaken
the production migration.