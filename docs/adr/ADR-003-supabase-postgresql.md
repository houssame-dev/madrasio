# ADR-003: Supabase PostgreSQL

- Status: Accepted
- Date: 2026-08-15

## Context

The product is an early-stage SaaS with a strict low-budget requirement.

The system requires a relational database because the domain contains:

- Academic relationships
- Enrollment
- Teacher assignments
- Curriculum versions
- Grades
- Historical records
- Foreign-key relationships
- Strong constraints

Supabase provides managed PostgreSQL and additional platform services.

## Decision

Use Supabase PostgreSQL as the V1 database.

The application uses PostgreSQL as its authoritative relational data store.

## Alternatives Considered

### Self-hosted PostgreSQL

Technically valid but rejected for V1 because it increases operational responsibilities.

### MongoDB

Rejected because the domain is strongly relational and requires historical relationships and database constraints.

### Other managed PostgreSQL providers

Possible, but Supabase provides a useful combination of PostgreSQL and authentication capabilities for the project's current stage.

## Consequences

### Positive

- Managed PostgreSQL
- Strong relational database
- Easy development
- Lower operational overhead
- Free tier suitable for early MVP usage

### Negative

- Free-tier limits
- Production backup/recovery capabilities may require an upgrade
- Dependence on an external provider

## Migration Strategy

Database access is isolated behind Drizzle so that the application domain is not coupled directly to Supabase-specific database APIs.