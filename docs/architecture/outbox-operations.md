# Outbox Operations (Task 013)

> Module: **Notifications / Infrastructure**
> Status: **Implemented (Task 013)**
> Related: ADR-012 (Transactional Outbox), ADR-013 (Persisted Notifications),
> ADR-015 (Defer Redis/BullMQ), CLAUDE.md §30–§33, `docs/domain/business-rules.md`
> §17/§21, `docs/architecture/overview.md` §33–§35.

This document describes the small operational layer built over the existing
transactional Outbox (`outbox_events`). It adds safe retry, bounded batch
draining and operational visibility — WITHOUT introducing a new queue system,
Redis/BullMQ, Kafka, a second outbox, distributed locks, dead-letter
infrastructure, or a cron platform (CLAUDE.md §33, ADR-015).

The outbox model itself is NOT redesigned. `outbox_events` remains exactly as
committed; no schema change and no migration were required.

---

## 1. Lifecycle semantics

The status model is preserved unchanged:

| Status | Meaning | Retryable |
|---|---|---|
| `PENDING` | Waiting / retryable. Also the resting state after a transient (infrastructure) failure. | Yes |
| `PROCESSING` | Reserved for a worker mid-flight. Nothing writes it today. | No (refused while in flight) |
| `PROCESSED` | Terminal success. Never processed again. | Idempotent no-op |
| `FAILED` | Deterministic processing failure recorded with a readable `last_error`. | Yes — always, explicitly |

`FAILED` is NEVER interpreted as permanently dead. A `FAILED` event is retried
again (and again) until its underlying cause is repaired; once repaired it
transitions to `PROCESSED`. On the successful transition `last_error` is
cleared so the terminal state carries no stale failure.

## 2. Deterministic vs transient failures

- **Deterministic** (`NotificationProcessingError`): unsupported event type,
  malformed payload, unresolvable source, explicit domain processing failure.
  The processor moves the event to `FAILED` with `last_error` — never silently
  dropped, never marked `PROCESSED`.
- **Transient** (any other error): the event stays `PENDING`; it is NEVER
  converted to `FAILED`. `PENDING` means "retry without a domain repair".

These semantics are owned by the existing processor (`processNotificationEvent`)
and are reused unchanged by the operational layer.

## 3. Specific retry — `retryOutboxEvent`

`apps/web/lib/modules/notifications/application/retry-outbox-event.ts`

1. Load the event; missing → controlled `OUTBOX_EVENT_NOT_FOUND`.
2. `PROCESSING` → controlled `INVALID_RETRY_STATE` (do not drain in-flight work).
3. `PROCESSED` → idempotent no-op returning the current state
   (`alreadyProcessed: true`, zero notifications).
4. `PENDING` or `FAILED` → invoke the existing `processNotificationEvent`.
5. Return the resulting event state (`previousState`, `resultingState`,
   `notificationsCreated`, `lastError`).

The use case REUSES the processor — no notification logic is duplicated. On a
deterministic failure the `NotificationProcessingError` (with its `featureCode`)
propagates for observability; the event has already been moved to `FAILED`.

## 4. Bounded batch — `processRetryableOutboxEvents`

`apps/web/lib/modules/notifications/application/process-retryable-outbox-events.ts`

- **Normal batch**: selects `PENDING` only (`includeFailed` defaults to
  `false`). Deterministic `FAILED` rows are NOT hammered during normal
  processing.
- **Operational retry batch**: `includeFailed: true` explicitly adds `FAILED`.
  A `FAILED` event may re-fail repeatedly until someone fixes the cause.
- **Bounded work**: at most `limit` events per run — default **25**, maximum
  **100** (`OUTBOX_BATCH_DEFAULT_LIMIT` / `OUTBOX_BATCH_MAX_LIMIT`). Safe as the
  outbox grows.
- **Deterministic ordering**: `created_at ASC, id ASC` (never unspecified row
  order).
- **Per-event isolation**: every event is processed within its own boundary.
  One event's failure never aborts the batch; event #1's committed success
  stays committed, and event #3 is still attempted. There is NO single
  transaction around the batch — each event processor owns its transactional
  correctness.
- **Transient handling**: a transient error is reported at the operational
  layer, the event stays `PENDING`, and the batch continues.
- **Summary**: `{ attempted, processed, failed, pending, results[] }`. `pending`
  counts events still `PENDING` after the run (transient failures). Each result
  carries `eventId`, `eventType`, `previousState`, `resultingState`,
  `notificationsCreated` and, on deterministic failure, a controlled
  `featureCode`. No payload, stack trace or DB internals are exposed.

## 5. Idempotency & concurrency

No locks are introduced. Concurrency safety comes from the existing processor:

- `PROCESSED` is short-circuited at load time.
- Inserts use `UNIQUE(source_event_id, recipient_user_id)` +
  `ON CONFLICT DO NOTHING`.
- Each event's notification inserts + `PROCESSED` mark happen in one
  transaction.

Two workers may therefore attempt the same `PENDING` event safely: duplicate
delivery cannot create duplicate logical notifications (BR-NOTIFICATION-005,
CLAUDE.md §32).

## 6. Retry never mutates the source domain

Retrying an event only consumes its historical data — it never re-publishes a
Result or an Announcement, never recreates publication history, and never
re-resolves recipients:

- **Announcement**: recipients come exclusively from the immutable
  `publication_recipient_snapshots` (BR-ANNOUNCEMENT-010).
- **Result**: recipients come exclusively from the frozen `recipientUserIds` in
  the event payload (Task 012 §7).

Historical integrity on retry (Task 013 §21/§22):

- **T1**: Announcement snapshot = `[A, B]`; later A loses eligibility and C
  becomes eligible; retry notifies `[A, B]` — NOT `[B, C]`.
- **T1**: ResultPublished payload recipients = `[A, B]`; later relationships
  become `B + C`; retry notifies `[A, B]` — NOT `[B, C]`.

The processor never imports or calls `resolveAnnouncementRecipients` /
`resolveResultNotificationRecipients` during notification processing.

## 7. Visibility

Operational repository queries (`notification-repository.ts`) expose lifecycle
fields only — `id`, `event_type`, `status`, `created_at`, `processed_at`,
`last_error`, `attempt_count` — and NEVER the event `payload`. Outbox payloads
can contain recipient IDs and academic context; they are never exposed through
operational views (Task 013 §19). `attempt_count` is read-only; attempt-count
metrics requiring schema changes are deferred (Task 013 §25).

## 8. Security & API decision

**No public API is exposed.** The outbox is infrastructure with no tenant FK
(events from multiple Schools share the table). School admins must never inspect
or retry another School's events, and tenant scope cannot be reliably derived
for every outbox row without inventing tenant ownership. Therefore:

- The operational entry points are **server-internal application helpers**
  (`retryOutboxEvent`, `processRetryableOutboxEvents`) — callable only from
  trusted server code (e.g. a future scheduled runner).
- There is no Outbox route, no dashboard, no retry button, no admin UI
  (Task 013 §36).
- Client-facing access to Notifications remains unchanged: read/mark-read use
  the normal school-scoped authorization pipeline, and a notification never
  grants source access (BR-NOTIFICATION-008).

A future task may add a SUPER_ADMIN/platform-ops permission and an explicit
internal endpoint only if the Authorization Foundation grows a platform
workflow; none exists today (permissions.ts defines only school-scoped
permissions).

## 9. Future runner boundary

A future scheduled runner may invoke `processRetryableOutboxEvents()` (and/or
`retryOutboxEvent()`) periodically. No cron platform, no `next_retry_at`, no
backoff scheduling, no queue-delay system is created now (Task 013 §26). The
requirement satisfied here is that the entry points are SAFE to call
repeatedly — idempotent, bounded, per-event isolated, and deterministic.

## 10. What was NOT added

- No Redis / BullMQ / Kafka / RabbitMQ (ADR-015).
- No second outbox, no dead-letter infrastructure, no distributed locks.
- No retry counter management (the schema's `attempt_count` exists and is
  exposed read-only; it is not incremented by this task).
- No migration. The committed `outbox_events` schema fully supports this
  operational layer.