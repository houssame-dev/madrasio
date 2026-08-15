# ADR-012: Transactional Outbox

- Status: Accepted
- Date: 2026-08-15

## Context

Important domain events must not be lost if event delivery fails after a successful database transaction.

## Decision

Critical cross-module events are persisted through a Transactional Outbox.

The domain transaction stores:

1. Domain state changes
2. Outbox event

within the same database transaction.

After commit, asynchronous processing handles the event.

## Consequences

### Positive

- Prevents lost events
- Supports retry
- Enables reliable Notification processing
- Does not require Kafka/RabbitMQ in V1

### Negative

- Requires an outbox table
- Requires processing and retry logic

## Constraint

Consumers must be idempotent.