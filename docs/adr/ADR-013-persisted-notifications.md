# ADR-013: Persisted Notifications as Source of Truth

- Status: Accepted
- Date: 2026-08-15

## Context

Users may be offline or temporarily disconnected from realtime delivery.

Realtime events cannot be treated as durable storage.

## Decision

Notifications are persisted in the database.

Realtime delivery is an optional enhancement.

## Consequences

If realtime delivery fails:

- Notification remains available
- User can retrieve it later
- Unread state remains correct

This makes the system resilient to connection interruptions.