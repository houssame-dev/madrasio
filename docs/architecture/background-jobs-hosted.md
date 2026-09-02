# Hosted Background Jobs

> Task 044 makes the existing Outbox and scheduled Announcement architecture
> operational. It targets Supabase STAGING project `cqeaxlttezunirsmkrxz` and
> introduces no schema migration, queue platform, worker service, or Production
> configuration.

## Architecture and source of truth

Important domain transactions persist an `outbox_events` row atomically with
their publication state. A bounded background invocation claims Outbox rows,
projects persisted Notifications from frozen recipients, and completes each
event. PostgreSQL is the source of truth; invocation timing is not. Missed runs
leave durable work for the next run.

Scheduled Announcements follow a separate first stage:

```text
due SCHEDULED publication
  -> canonical Announcement publication transaction
  -> recipient snapshots frozen at execution time
  -> AnnouncementPublished Outbox event
  -> later Outbox invocation
  -> persisted Notification rows
```

The scheduled processor never creates Notifications directly.

## Outbox processor

`processRetryableOutboxEvents` uses a default batch of 25 and a hard maximum of
100, ordered by `created_at ASC, id ASC`. Each event owns a transaction. The
worker selects the candidate again with `FOR UPDATE SKIP LOCKED`, changes it to
`PROCESSING`, increments `attempt_count`, inserts its Notifications, and marks
it `PROCESSED` in that same transaction. This works through the runtime
Transaction Pooler because it requires no session-persistent state.

The current event contracts are exactly:

- `AnnouncementPublished` -> `ANNOUNCEMENT_PUBLICATION` source;
- `ResultPublished` -> `RESULT_PUBLICATION` source;
- `ResultRevisionPublished` -> `RESULT_PUBLICATION` source with the distinct
  revision publication/version represented by the committed event.

Announcement recipients come only from immutable publication recipient
snapshots. Result recipients come only from the frozen event payload. The
processor never re-evaluates current Enrollment, ParentStudent, or
TeacherAssignment state.

Notification uniqueness on `(source_event_id, recipient_user_id)` with
conflict-safe insertion is idempotency defense-in-depth. A completed event is
not selected again. A deterministic processing error becomes `FAILED` with a
controlled error; normal batches do not hot-loop failed rows. A transient
database/infrastructure failure rolls back the claim and leaves the event
retryable. One event failure does not roll back independently completed events
or stop later candidates in the batch.

## Scheduled-publication processor

`processDueAnnouncementPublicationsBatch` discovers only bounded rows where
`status = SCHEDULED` and `scheduled_at <=` the exact current instant. It calls
the canonical `publishDueAnnouncement` use case. Publication ownership is
claimed by its existing conditional SCHEDULED-to-PUBLISHED update inside the
publication transaction. Concurrent callers can discover the same row, but
only one can perform recipient resolution, freeze snapshots, and create the
Outbox event. A second caller receives the canonical no-op outcome.

Times are instants. The processor introduces no browser, School-timezone, or
date-only conversion.

## Protected endpoints

The server-only endpoints are:

- `POST /api/internal/jobs/process-scheduled-announcements`
- `POST /api/internal/jobs/process-outbox`

They require `Authorization: Bearer <CRON_SECRET>`. `CRON_SECRET` is a distinct
server-only credential, is never `NEXT_PUBLIC`, and is not the Supabase
service-role key or a School-user credential. The implementation performs an
exact timing-safe comparison of fixed-length digests. Missing, malformed, or
incorrect credentials receive a generic `401`; an unconfigured server receives
a generic `503`. Session cookies confer no authority. `GET` returns `405` and
does no work.

Responses contain safe operational aggregates only: attempted/processed or
published/failed/remaining counts. They never contain event payloads,
recipients, notification content, tokens, or stack traces. Structured server
logs contain the job name, correlation identifier, aggregate counts, and
duration only.

`.env.example` names the variable without a value. Real credentials belong in
ignored local environment files and, after deployment, secure environment and
Vault configuration.

## STAGING manual verification

There is no approved public Vercel Staging origin yet. Task 044 therefore ran a
production build locally with the real STAGING runtime connection and invoked
both protected routes over local HTTP. The path exercised was:

```text
local HTTP -> Next.js internal route -> application service
  -> Supavisor Transaction Pooler -> Supabase PostgreSQL
```

Before processing, the Outbox contained seven `PENDING` events and Notifications
were empty. Frozen recipients implied eight logical Notification rows:

| Event | Events | Notifications |
| --- | ---: | ---: |
| `AnnouncementPublished` | 2 | 2 |
| `ResultPublished` | 4 | 4 |
| `ResultRevisionPublished` | 1 | 1 |

The original drain processed all seven once. A second drain processed zero and
created no duplicate. One controlled Class/PARENTS Announcement was created
through canonical APIs and scheduled for a near-future instant. A pre-due run
ignored it. The first due run published it once, froze one recipient, and made
one `AnnouncementPublished` Outbox row without creating a Notification. A
second scheduled run was a no-op. The Outbox worker then projected the eighth
Notification; its retry was also a no-op.

The real Parent inbox showed eight persisted Notifications with valid source
metadata and no realtime dependency. Unread count moved from 8 to 7 after one
mark-read operation and to 0 after read-all. Historical items remained readable
without current relationship re-authorization.

The original publication scheduled for `2027-06-15T12:00:00.000Z` remains
unchanged in `SCHEDULED` state. It was not executed.

## Final Task 044 hosted state

- `AnnouncementPublished`: 3 `PROCESSED`;
- `ResultPublished`: 4 `PROCESSED`;
- `ResultRevisionPublished`: 1 `PROCESSED`;
- Notifications: 8 total, 0 unread, 8 read;
- Announcement publications: 3 `PUBLISHED`, 1 `SCHEDULED`;
- publication recipient snapshots: 3;
- the sole future scheduled publication is the preserved 2027 fixture.

No Outbox event was manually edited or processed outside the application
service. No scheduled timestamp was changed after creation.

## Supabase Cron deployment contract (Task 046)

STAGING currently has neither `pg_cron` nor `pg_net` installed. Task 044 did
not enable them because no public Staging origin exists. Task 046 must:

1. deploy the application to an approved Vercel Staging HTTPS origin;
2. configure the same strong `CRON_SECRET` in Vercel server environment;
3. enable/verify Supabase Cron and `pg_net` in STAGING as managed environment
   infrastructure, without a Drizzle domain migration;
4. store the scheduler credential in Supabase Vault, never plaintext in SQL;
5. register an every-minute authenticated POST to
   `https://<staging-origin>/api/internal/jobs/process-scheduled-announcements`;
6. register an every-minute authenticated POST to
   `https://<staging-origin>/api/internal/jobs/process-outbox`;
7. smoke-test unauthorized denial and authenticated invocation against that
   exact origin, then verify database outcomes.

Cron/pg_net SQL may only perform the authenticated HTTP invocation. It must not
resolve recipients, publish Announcements, create Notifications, or embed the
secret. Reproducibility should use a guarded STAGING operator/deployment command
or documented Supabase management operation tied to the deployed origin, not a
normal application migration and never a placeholder URL.

## Limitations and handoff

Task 046 now represents this contract with guarded repository commands and the
two stable job names documented in `vercel-staging-and-cicd.md`. Provider-side
registration and hosted invocation remain acceptance steps and must not occur
until the stable Vercel origin and matching server secret exist. Realtime
delivery, exponential backoff, dead-letter
queues, and broader observability are also outside this task. Durable database
state and repeatable one-minute polling are sufficient for the current load.

Task 045 may proceed: Outbox projection, retries, concurrency, scheduled
publication, protected routes, Parent Notification API/UI, and identity-free
machine authentication are operational, while the Task 046 deployment contract
is explicit.
