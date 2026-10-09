# ADR-023 — Explicit platform authority separate from School membership

Status: Accepted for Task 058 implementation; hosted rollout separately gated.

## Context

Platform operators must manage Schools and Admin memberships without a School
context. The SUPER_ADMIN membership enum/permission placeholder cannot safely
distinguish independent platform authority from tenant access.

## Decision

Add one User boolean, `is_platform_admin`, non-null and default false. Only an
ACTIVE User explicitly designated through a separately reviewed operator process
may use narrow platform services. No runtime grant API is introduced. The
migration converts no memberships and derives no authority from Auth claims.

Platform layout/routes/services/audit form a separate boundary. Normal School
endpoints still require active memberships and scope. `/me` exposes only a
presentation capability, never a substitute School role. School Admins remain
SCHOOL_ADMIN memberships, unique per School/User, supporting multiple Admins
and cross-School identity reuse.

## Alternatives rejected

- Fake platform School or membership-derived global access: ambiguous scope.
- Blanket SUPER_ADMIN bypass: violates tenant boundaries.
- New User/Admin tables or generic RBAC framework: unnecessary for this V1 capability.
- Auth metadata/email allowlists: not application-owned authority.

## Consequences

One additive migration, no new tables, no automatic grants, no RLS policy changes.
Recovery includes the column in existing User rows/fingerprints. Initial operator
designation needs separate authorization. Platform mutations require atomic audit;
external invitation delivery retains the existing compensation limitation.

See [platform administration](../architecture/platform-school-administration.md).
