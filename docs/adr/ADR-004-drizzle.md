# ADR-004: Drizzle ORM

- Status: Accepted
- Date: 2026-08-15

## Context

The project uses PostgreSQL and requires:

- Type-safe database access
- Explicit SQL-like queries
- Migrations
- Good serverless compatibility
- Strong relational modeling

Prisma and Drizzle were considered.

## Decision

Use Drizzle ORM.

## Rationale

Drizzle provides:

- Type-safe schema
- Explicit queries
- PostgreSQL support
- Migration tooling
- Lightweight runtime behavior
- Good compatibility with the Next.js/Vercel architecture

## Alternatives Considered

### Prisma

Prisma has excellent developer experience and ecosystem maturity, but Drizzle is preferred for this project because its SQL-oriented model and lightweight approach fit the selected serverless/full-stack architecture better.

### Raw SQL only

Rejected because losing type-safe schema/query integration would create unnecessary maintenance overhead.

## Constraints

Domain code must not depend directly on Drizzle.

Drizzle-specific behavior belongs in Infrastructure/Repositories.

Database schema changes must use versioned migrations.