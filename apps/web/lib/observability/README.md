# `lib/observability`

Logging and operational-observability boundary.

V1 uses structured server logs captured by Vercel rather than adding an APM
dependency. `logger.ts` emits bounded JSON, redacts secret/credential/PII-shaped
metadata, and provides stable operational error categories. Logs are diagnostic;
database state remains authoritative for Outbox, publication, and Notification
workflows.
