# ADR-002: Next.js as the Full-Stack Application

- Status: Accepted
- Date: 2026-08-15

## Context

The system requires:

- Web UI
- REST API
- Server-side authorization
- Database access
- Server-side business logic
- Future support for additional clients

A separate NestJS backend was considered.

## Decision

Use Next.js as the full-stack V1 application.

Next.js will provide:

- React UI
- Server Components
- Route Handlers
- Server Actions where appropriate
- Server-side application logic

The application will still maintain explicit Domain and Application layers.

Route Handlers must remain thin.

## Alternatives Considered

### Next.js + NestJS

Rejected for V1 because it adds another runtime and deployment boundary without a demonstrated need.

### Next.js + separate backend service

Rejected for the same reason.

## Consequences

### Positive

- One application
- One primary deployment
- Shared TypeScript
- Simpler authentication
- Lower operational overhead

### Negative

- Strong internal architecture is required to prevent business logic from leaking into Next.js presentation code.
- Long-running background workloads may require separate infrastructure later.

## Future Trigger

A separate backend may be introduced later if actual requirements justify:

- Independent backend scaling
- Multiple frontend teams
- Heavy long-running workloads
- Significant integrations
- Organizational separation