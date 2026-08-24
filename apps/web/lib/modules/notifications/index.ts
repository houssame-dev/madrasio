/**
 * Notifications module (Tasks 010, 012, 013, and 024).
 *
 * Persisted, school-scoped notifications whose DATABASE record is the source
 * of truth (ADR-013). The processor consumes durable outbox events
 * (ADR-012); there is no realtime/WebSocket/email/SMS/push channel in V1
 * (ADR-014/ADR-015).
 *
 * Public surface: domain vocabulary/content + application use cases.
 * Drizzle specifics stay inside `infrastructure/` (ADR-004, CLAUDE.md §24).
 */

export * from './domain';
export * from './application';
export type { NotificationsDb } from './infrastructure/repositories/notification-repository';
