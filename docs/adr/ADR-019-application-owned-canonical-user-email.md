# ADR-019: Application-Owned Canonical User Email Mapping

- Status: Accepted
- Date: 2026-09-01

## Context

ADR-018 gives the Auth and application User one UUID, but `public.users` had no
deterministic email lookup. Task 045 account provisioning must recognize an
existing platform User by submitted email, verify that exact UUID through
Supabase Auth Admin, and reuse the identity across Schools. Scanning
`auth.admin.listUsers()`, guessing UUIDs, or treating an invite error as an
identity lookup is neither deterministic nor safe.

## Decision

`public.users.email` is the application-owned identity lookup projection for
V1 email-authenticated Users. It is `TEXT NOT NULL`, unique, and stored only in
the canonical form produced by trimming surrounding whitespace and lowercasing.
The database checks canonicality and rejects blank values.

Supabase Auth remains the authentication and credential authority. The
application projection stores no password, token, session, or authorization
claim. For every V1 application User:

```text
public.users.id = auth.users.id
public.users.email = lower(trim(auth.users.email))
```

Provisioning normalizes the submitted email, looks up `public.users.email`,
then calls Auth Admin `getUserById(public.users.id)`. Reuse is allowed only
when the Auth UUID exists and its normalized email equals the application
projection. A mismatch fails closed as
`ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED`; SchoolAdmin provisioning must not
silently rewrite either side or disclose the conflicting email.

## Migration and reconciliation

Migration 0014 adds the column as nullable, performs a one-time read-only join
from `public.users.id` to `auth.users.id`, and stores the normalized Auth email.
Before final constraints are applied it fails if any application User lacks an
Auth row, has a null/blank Auth email, or collides after normalization. It then
sets `NOT NULL`, adds one unique constraint, and adds the canonicality check.
The migration never creates, inserts, updates, deletes, or alters Auth objects.

This is replayable both on a fresh Supabase project with zero application
Users and on an existing coherent project.

## Alternatives rejected

- scanning all Supabase Auth users for each provisioning request;
- using `auth.users` as the application lookup repository;
- guessing or accepting an Auth UUID from a SchoolAdmin client;
- resolving identity from `inviteUserByEmail` error behavior;
- one Auth identity per School;
- adding email to Teacher, Parent, or SchoolMembership;
- a generalized provider/identity-history model before V1 needs one.

## Consequences

One Auth/application User can be reused across multiple SchoolMemberships
without duplicate accounts. Email is not broadly exposed through `/me` or a
User directory; it exists for narrowly authorized server identity workflows.

An Auth email change can make the projection stale. A future controlled
email-change/reconciliation workflow must update both representations safely.
Until then, mismatches require operator reconciliation and fail closed. Future
OAuth, phone, SAML, multiple-email, or identity-history requirements may
justify a broader model, but are outside this decision.
