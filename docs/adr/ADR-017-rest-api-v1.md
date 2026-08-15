# ADR-017: Versioned REST API

- Status: Accepted
- Date: 2026-08-15

## Context

The application needs a stable API boundary for:

- Next.js clients
- Future mobile clients
- Future external integrations

## Decision

Use REST for V1.

All public application API endpoints are versioned under:

`/api/v1`

## Consequences

API contracts can evolve later through:

`/api/v2`

without requiring immediate breaking changes to V1 clients.

## Constraints

- Resource naming must be consistent.
- Business actions use explicit action endpoints.
- DTOs separate API contracts from domain/database models.
- Authorization is enforced server-side.