# Private application Files and attachments

Task 063 implementation handoff; validation and hosted activation are not claimed. Extends ADR-006 (R2), ADR-007 (School ownership), the domain File/AnnouncementAttachment contracts, Task 054 audit, and Task 062 immutable publication recipients. Task 065 extends this foundation with private HomeworkSubmission attachments; see [the hand-in contract](homework-delivery-actual-handin.md).

## Authority and persistence

PostgreSQL owns identity, School ownership, metadata and associations. R2 stores private bytes only. No public URL, signed URL, object key, File ID, notification payload or client-supplied School becomes access authority. There is no generic file directory, association endpoint, upload repository or arbitrary object-delete endpoint.

Migration `0020_private-application-files` adds `files` and `announcement_attachments`. The former stores UUID, authoritative School/creator, upload request UUID, validated display name/media type/size, SHA-256, opaque object key, lifecycle and timestamps. The latter binds one File to one exact AnnouncementVersion and records logical removal. Composite foreign keys enforce same-School Version/File association; File association is unique and deletes are restricted. The request tuple `(school_id, created_by, request_id)` and object key are unique. Both tables enable RLS with zero application policies and explicitly revoke Data API grants, following 0015/0016. No historical rows are fabricated.

Current repository inventory: **23 migrations (0000–0022), 43 application/RLS tables, 45 recovery tables** including the two durable Auth tables. Recovery format remains `madrasio-recovery-v1`. Snapshot/journal, migration readiness, security/deployment expectations, operator preflight and local recovery contracts are updated. No prior migration is changed.

## Private storage and deployment boundary

The server-only `PrivateFileStore` port supports conditional PUT, bounded GET and compensating DELETE. `R2PrivateFileStore` uses the same extracted SigV4 signing primitive as recovery transport; it does not share runtime configuration, credentials or bucket selection with backup. No SDK or new dependency is introduced. Configuration is lazy: imports/build/startup do not access storage.

| Runtime variable | Classification / purpose |
| --- | --- |
| `R2_ACCOUNT_ID` | Server config; exact account owning the application bucket |
| `R2_ENDPOINT` | Server config; exact HTTPS account endpoint, including `.eu` for EU-jurisdiction buckets; omission selects the standard account endpoint |
| `R2_BUCKET` | Server config; dedicated private application bucket, not a backup/recovery bucket |
| `R2_ACCESS_KEY_ID` | Server secret; environment-specific application bucket credential |
| `R2_SECRET_ACCESS_KEY` | Server secret; same narrowly bucket-scoped credential |

Never use `NEXT_PUBLIC_*`, backup writer/recovery-reader credentials, `R2_BUCKET_NAME`, age identities, or the backup bucket for this feature. Application credentials need object read/write/delete only for the reviewed application bucket, not account administration. Before separately authorized hosted activation, the operator must verify bucket privacy (no r2.dev/custom public domain), correct jurisdiction/endpoint, isolated STAGING/Production configuration, and credential scope. Configuration presence does not prove bucket privacy. This task performs no provider provisioning or hosted verification. Missing/invalid configuration fails closed. Migration-before-deploy remains mandatory; no build-time migration is introduced.

Objects use server-generated `application-files/<School UUID>/<random UUID>` keys, never filenames. Conditional `If-None-Match: *` prevents replacement. Requests reject redirects, have a bounded timeout and no automatic storage retries. Provider bodies and raw exceptions are not returned/logged. Runtime never grants a public ACL.

## Upload policy and HTTP surface

V1 accepts **PDF, PNG and JPEG**, 1–2,097,152 bytes, at most ten active attachments per Version. Filename length is 1–180 characters; surrounding whitespace, path separators, control characters and bidi overrides/isolates are rejected. Extension, declared MIME and identifying magic bytes must agree. This is conservative identification, **not malware scanning or complete document decoding**; active PDF content is not claimed safe. No inline preview is provided. DOCX, other media, scanning, OCR, image processing and public hosting are deferred.

Management base: `/api/v1/announcements/[id]/versions/[versionId]/attachments`.

- GET lists bounded metadata for that exact Version.
- POST receives raw file bytes plus `Content-Type`, percent-encoded `X-File-Name` and UUID `Idempotency-Key`; no JSON ownership/key association fields exist. Query parameters are rejected. Authentication and management authorization precede body consumption and storage I/O. Body streaming enforces the byte ceiling independently of Content-Length.
- DELETE `.../[attachmentId]` logically removes an attachment from a mutable Version.
- GET `.../[attachmentId]/download` authorizes management access before storage.

Recipient base: `/api/v1/me/announcements/[id]/attachments`, where `id` is the exact **publication** UUID. GET lists READY metadata; GET `.../[attachmentId]/download` downloads through the same publication boundary. There is no recipient mutation route and no Student account/upload path.

Download reads verify byte count and SHA-256 against DB metadata before responding. Responses force `application/octet-stream` and `Content-Disposition: attachment` with encoded display name; `nosniff`, sandbox CSP and private/no-store caching prohibit application inline rendering/cache reuse. Object URLs, keys, uploader identifiers and checksums are not in public attachment DTOs. Invalid/missing/corrupt storage returns a controlled unavailable result, not a redirect or fallback object.

## Authorization, Version lifecycle and concurrency

Management delegates to the existing Announcement management policy: active User/current School membership, exact same-School Announcement/Version, SchoolAdmin/permitted SuperAdmin or an author Teacher whose active assignments cover the exact Version's targets. Parents cannot manage. Resource/UUID substitution never substitutes another School or Version.

All mutation phases lock the logical Announcement row, in the same order as Task 062 publish/schedule/cancel/target/correction operations. Only the latest Version with **no publication intent ever** and a non-archived Announcement may change attachments. Scheduled, cancelled and published intent all freeze the set. New corrections/revisions start with an independent, empty attachment set; attachments are not silently copied from earlier Versions. Removed rows and metadata remain historical evidence.

Recipient reads first call Task 062 `getRecipientAnnouncement`, then use that publication's exact Version. Current active identity/School gates remain required; immutable recipient snapshots grant historical access even after ParentStudent/TeacherAssignment changes. Nonrecipients and other Schools remain denied. Notification destinations/payloads/Outbox idempotency are unchanged; links still lead to authorized exact-publication detail, where attachments are listed.

Publication and scheduling refuse active non-READY attachments while holding the same Announcement lock. Due processing rechecks readiness inside its transaction. A reservation that wins first prevents publication until finalized/removed; publication intent that wins first prevents a new reservation. PostgreSQL uniqueness is the replay backstop; R2 I/O occurs outside DB transactions, so a database lock is not held across network latency.

## Consistency, retries and reconciliation

1. Authorize and validate bytes. Under the Announcement lock, reserve an UPLOADING File and exact-Version association atomically.
2. PUT the opaque object once with conditional creation.
3. Reacquire the lock, reauthorize and recheck mutability/association. Set READY and append `AnnouncementAttachmentAdded` in one transaction. Only then report success.

A completed identical request replays the existing association without storage I/O or another audit event (provided the Version is still mutable). Reusing the request ID for different bytes/name/type/Version or a removed association conflicts. UPLOADING/REJECTED retries fail closed rather than silently issuing another PUT. A retry after the Version freezes is rejected, not duplicated. The browser retains the request UUID for a selected file, disables duplicate submission and invalidates only the attachment query scoped to current School/User/resource.

If PUT fails or its outcome is uncertain, preserve UPLOADING metadata, expose `FILE_RECONCILIATION_REQUIRED`, and emit no success audit. Do not delete an object whose creation was not confirmed. If PUT succeeded but finalization/audit failed, reread the File: only a confirmed UPLOADING row permits compensating deletion of this request's exact object, followed by REJECTED state. If the DB outcome is unknown or already READY, do not delete. This avoids deleting an ambiguously committed successful attachment. Cleanup failure preserves intent and the same reconciliation-required result, never false success. Process termination can leave UPLOADING intent; automatic promotion, repeated PUTs and garbage collection are intentionally absent.

Operator reconciliation must inspect the exact File/association and publication state through a separately reviewed, scoped operation; verify object byte count/hash before deciding any cleanup or recovery. Do not guess keys, relink across resources, bulk-delete by prefix or repair immutable published sets. No new reconciliation CLI/provider writes are part of this task. A manager may logically remove an incomplete attachment from a still-mutable Version to unblock publication, but this does not prove object cleanup. Removed/orphan bytes require separately authorized retention/cleanup work. Keep metadata until reconciliation has established provenance.

## Audit and UI

Successful finalization and logical removal append `AnnouncementAttachmentAdded` / `AnnouncementAttachmentRemoved` using Task 054's transaction-bound writer, authoritative actor/School and exact Version/attachment/File IDs. No filenames, bytes, keys, URLs or credentials enter audit metadata. Audit failure rolls back the successful DB mutation; R2 compensation remains outside that transaction. Operational reservation/cleanup states are not falsely audited as successful uploads.

Announcement detail provides upload/removal only on the mutable latest Version, with accessible labels, constrained file chooser, pending/duplicate protection, controlled feedback and removal confirmation. Version history is read-only. Parent/Teacher inbox publication detail exposes private download links and no upload controls. Task 065 adds append-only Submission upload/list/download, with current active Teacher assignment or SchoolAdmin authority and scoped Parent reads. It reuses the same File metadata, policy, storage port and download protections. Upload is restricted to unreviewed PUBLISHED Homework; files retain their original recording association across resubmission. No removal/reassignment, avatars or general file management are introduced.

## Recovery limitation

Full-row fingerprints and FK-order replay include both new tables, including object keys, hashes, state, exact Version association and removal timestamps. **A DB recovery bundle contains metadata only, not the referenced R2 object bytes.** Existing Task 050 RTO/RPO evidence does not establish an attachment-byte recovery objective. Missing bytes after restore remain unavailable; no substitute, public fallback or invented attachment is served. Before relying on production attachments, independently review object retention/backup/restore and rehearse metadata-to-byte consistency. Do not rewrite historical Task 050 acceptance as though it included this later feature.

## Manual validation (not executed)

Run from the repository root in PowerShell with hosted/provider opt-ins disabled. Ordinary tests use fake storage and hermetic databases, not real R2. The migration tests replay locally and include populated legacy upgrade.

```powershell
pnpm --filter @school/web test --maxWorkers=2 --minWorkers=1 __tests__/files __tests__/announcements __tests__/frontend/announcements __tests__/notifications __tests__/frontend/notifications
pnpm --filter @school/database test --maxWorkers=2 --minWorkers=1 __tests__/private-files-migration.test.ts __tests__/migration-readiness.test.ts __tests__/announcement-lifecycle-migration.test.ts __tests__/publication-context-migration.test.ts __tests__/audit.test.ts __tests__/platform-authority.test.ts __tests__/security-hardening.test.ts
pnpm --filter @school/web test --maxWorkers=2 --minWorkers=1 __tests__/recovery __tests__/security/hardening.test.ts __tests__/deployment __tests__/operator __tests__/jobs
pnpm lint
pnpm typecheck
git diff --check
pnpm test --maxWorkers=2 --minWorkers=1
pnpm build
pnpm --filter @school/web test:e2e --workers=1 --retries=0 --reporter=list
```

The explicit Docker/age local recovery integration remains opt-in via `RECOVERY_TEST_LOCAL_TARGET=1`, using the existing pinned local toolchain; it is not required for ordinary tests and was not executed. No hosted migration command is authorized by this handoff. Review/commit, migration/deployment, private bucket setup and hosted authorization/download acceptance remain later operator gates.
