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