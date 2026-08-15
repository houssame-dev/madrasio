# ADR-005: Supabase Auth

- Status: Accepted
- Date: 2026-08-15

## Context

Authentication requires:

- Login
- Session management
- Password handling
- Account recovery
- Secure identity handling

Building all authentication infrastructure internally would add unnecessary complexity to the MVP.

## Decision

Use Supabase Auth for authentication.

The application retains ownership of authorization.

Supabase Auth answers:

> Who is this user?

The application answers:

> What can this user do?

## Application Authorization

Authorization is based on:

- Role
- SchoolMembership
- Permission
- TeacherAssignment
- ParentStudent
- StudentEnrollment
- Ownership
- Relationship
- Resource State

## Consequences

### Positive

- Reduced authentication implementation
- Secure identity/session infrastructure
- Lower development cost
- Integration with Supabase ecosystem

### Negative

- Provider dependency
- Migration would be needed if the authentication provider changes

## Security Constraint

Supabase service credentials must never be exposed to the client.