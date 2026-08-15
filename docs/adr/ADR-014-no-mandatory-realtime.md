# ADR-014: No Mandatory Realtime in V1

- Status: Accepted
- Date: 2026-08-15

## Context

The V1 product needs Notifications but does not require chat or highly interactive realtime collaboration.

Adding realtime infrastructure immediately would increase complexity.

## Decision

Realtime is optional in V1.

Correctness must work without it.

The initial notification experience can rely on:

- Persisted notifications
- TanStack Query
- Refetching/reconciliation

Supabase Realtime may be added later.

## Trigger for Change

Consider realtime when there is a demonstrated requirement for:

- live notification badges
- live dashboards
- live collaborative updates
- other meaningful realtime UX