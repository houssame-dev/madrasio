# Notifications module

Owned by: Notifications

Responsibilities:
- Notification persistence (DB is source of truth)
- Idempotent notification generation
- Self-owned, current-School inbox reads
- Idempotent one-way unread → read semantics
- Bounded filtering, pagination, and unread count

The Outbox processor is the only Notification producer. The inbox API never
creates rows, re-resolves historical recipient eligibility, or grants access
to a referenced source resource. Realtime delivery is not the source of truth
and is intentionally absent in V1.
