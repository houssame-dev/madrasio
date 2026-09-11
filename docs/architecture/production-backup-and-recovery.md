# Production backup and recovery

Status: Task 050 Stage 2 repository contract. The implementation is precommit and has not produced a Production recovery point. Customer onboarding remains blocked by the backup gate.

## Recovery objective and authority

The accepted target is an application-controlled recovery point at least every six hours (RPO target: 6 hours) and a rehearsed restoration within eight hours (RTO target: 8 hours). Neither objective is operationally proven yet.

Recovery uses hybrid Model B:

1. create a fresh isolated Supabase-compatible foundation;
2. apply the exact repository migration chain for `public` schema authority;
3. restore the minimum durable Supabase Auth identity state;
4. restore the allowlisted application data;
5. recreate environment-specific provider configuration;
6. reconcile data, identity, relationships, and security.

`drizzle.__drizzle_migrations` is not backed up as data. The encrypted manifest records the ordered migration tags and migration-file SHA-256 values. Restore applies repository migrations and must match that contract. Provider configuration, Cron/Vault values, SMTP credentials, sessions, tokens, and transient Auth data are not database recovery payloads.

## Format and contents

`madrasio-recovery-v1` is the only accepted format. Unknown, missing, or malformed formats fail closed. The bundle is a repository-owned binary container with a length-delimited canonical JSON index and per-entry SHA-256 checks. It contains:

- `recovery-data.dump`: PostgreSQL custom-format, data-only archive;
- `manifest.json`: source identity, versions, migration contract, table counts/fingerprints, Auth schema compatibility contract, provider reconstruction facts, and internal artifact checksums.

The whole bundle is encrypted with age. The final transport object is ciphertext only. The manifest is intentionally encrypted because counts and hashes are still operational metadata. A ciphertext SHA-256 is calculated independently of object-store ETags.

The authoritative data allowlist is centralized in `apps/web/scripts/recovery/contracts.ts`: all 39 `public` application tables plus `auth.users` and `auth.identities`. The tool rejects application inventory drift and archive entries outside this set. It also rejects non-email identities, phone/anonymous users, and non-empty durable MFA, SSO, OAuth, or WebAuthn tables covered by the discovery contract. Auth sessions, refresh tokens, one-time tokens, flow state, challenges, and audit logs are deliberately excluded.

## Backup safety and consistency

`pnpm recovery:backup:production` requires the existing exact Production guard:

- `DEPLOY_TARGET_ENV=production`;
- exact Production project ref supplied through the deployment contract;
- Frankfurt Session Pooler on port 5432;
- official CA material and certificate/hostname verification;
- no insecure TLS override.

It rejects STAGING, loopback, port 6543, ambiguous refs, missing CA, and plaintext fallback. Database credentials are supplied to native tools through `PG*` environment variables, not command arguments.

The coordinator starts one `REPEATABLE READ READ ONLY` transaction, fixes UTC, exports a PostgreSQL snapshot, and remains open until every consumer completes. `pg_dump`, inventory, source counts, primary-key hashes, content hashes, Auth schema metadata, and status data therefore use the same source state. The exported snapshot token is ephemeral runner-local metadata and is neither logged nor bundled.

The archive command is native PostgreSQL 17 custom format (`-Fc`), data-only, with every table explicitly supplied and ownership/privileges/comments excluded. `pg_restore --list` must contain exactly the allowlisted table-data entries and no DDL/ACL/provider state. Production server major is 17; `pg_dump` may not be older. The reviewed tool set is PostgreSQL 17.6, age 1.3.1, and Supabase CLI 2.111.0 for a future pinned disposable local Supabase harness. Floating `latest` tooling is forbidden. A future binary bootstrap must use an authoritative HTTPS source plus a committed reviewed checksum; Stage 2 does not silently download tools.

## Fingerprints and manifest

Rows are ordered by their database primary key. Each primary key and canonical row is rendered by PostgreSQL as JSONB text, then hashed by Node using a four-byte big-endian length frame followed by UTF-8 bytes. PostgreSQL JSONB provides stable object-key normalization; the transaction fixes UTC. The manifest stores only counts and SHA-256 values, never rows, emails, password hashes, or metadata bodies. Paging occurs inside the exported snapshot.

The manifest records a collision-resistant backup ID (UTC instant, Git SHA prefix, and 64 random bits), exact Git SHA, source ref/region, PostgreSQL server/client versions, ordered migration metadata, Auth column/type/nullability compatibility data, artifacts, encryption tool and one-way recipient fingerprint, and a non-secret provider contract. Provider metadata names expected Vault/Cron resources but never includes their values, database URLs, SMTP secrets, deploy hooks, or credentials.

## Encryption and plaintext cleanup

The backup process receives only `BACKUP_AGE_RECIPIENT`, never the offline private identity. `RECOVERY_GIT_SHA` must be the exact 40-character source revision, and `PRODUCTION_APP_ORIGIN` supplies the validated non-secret provider origin. The final `RECOVERY_OUTPUT_PATH` must use an `.age` destination outside the repository. Temporary plaintext uses a collision-resistant OS temporary directory with restrictive permissions where supported. Recursive cleanup validates both the system temporary root and the `madrasio-recovery-` prefix. Cleanup failure is a visible `BACKUP_PLAINTEXT_CLEANUP_FAILED`; this is best-effort removal from the accessible runner workspace, not a claim of forensic erasure on SSDs or hosted runners.

The offline private identity must remain outside the repository, CI, Vercel, GitHub secrets used for backup creation, and object storage. Restore requires an explicit external identity file; secret material is never accepted through loggable command arguments.

## Isolated restore

`pnpm recovery:restore:local` refuses Production, STAGING, Supabase hosts, and every non-loopback database. It requires all of:

- `RESTORE_TARGET_ENV=isolated-local`;
- `RESTORE_CONFIRMATION=RESTORE_ISOLATED_LOCAL`;
- a loopback `RESTORE_DATABASE_URL`;
- an external, non-repository `RECOVERY_AGE_IDENTITY_PATH`.

The operator must also confirm `RECOVERY_EXPECTED_SOURCE_PROJECT_REF` and `RECOVERY_REPOSITORY_GIT_SHA`; both must exactly match the encrypted manifest. The disposable target must have empty `auth.users`/`auth.identities`, no application tables, and no Drizzle journal before restore begins.

Restore is deliberately fail-closed and ordered:

1. verify the isolated foundation and exact captured Auth column/type/nullability contract;
2. apply repository migrations and compare the migration contract;
3. restore `auth.users`;
4. restore `auth.identities`;
5. restore `public` tables in discovered foreign-key topological order;
6. reconcile owned sequences;
7. recompute all fingerprints and counts;
8. verify public/Auth UUID and canonical email relationships, validated foreign keys, and the Task 047 application security audit.

No SMTP, invite, hook, job, or other network side effect is part of restore. Any failure stops later phases. The disposable target may then be destroyed; the tool does not attempt risky automatic repair or continue from ambiguous partial state. FK cycles are rejected for review rather than worked around by disabling constraints.

## Operations interfaces deferred from Stage 2

`RecoveryObjectStore` defines immutable ciphertext upload and metadata readback. `RecoveryHeartbeat` defines bounded success/failure reporting. Heartbeat success is emitted only after upload and independent remote size/SHA-256 verification. There is no Cloudflare R2 client, credential, bucket, GitHub scheduled workflow, or Healthchecks.io configuration in Stage 2.

Stage 3 must provision a private R2 bucket, retention/immutability controls appropriate to the plan, scoped write/read credentials, an age recipient whose private identity is held offline, and heartbeat monitoring. The scheduled workflow must use the repository tooling without acquiring the private decryption identity. It must not report success until remote verification passes.

## Local test contract and limitations

Unit tests cover exact-target rejection, allowlist drift, custom archive inventory, format/checksum rejection, deterministic canonical JSON, snapshot SQL ordering, restore ordering/cycle rejection, fail-closed phases, cleanup path safety, version/age validation, reconciliation, and upload-before-heartbeat behavior. A real PostgreSQL snapshot-sharing test is opt-in through `RECOVERY_TEST_DATABASE_URL`; it proves that a consumer importing an exported snapshot observes the original row set after another connection commits a write.

This workstation currently has no PostgreSQL 17 client, age, Docker, Supabase CLI, or disposable PostgreSQL server. Consequently, native archive/encryption and real PostgreSQL/Supabase restore rehearsal are implemented but not empirically passed here. They remain explicit proof requirements. A local Supabase harness must be pinned to a reviewed CLI/container version and must provide the managed Auth foundation before a rehearsal; application migrations must never create or own `auth.users`.

## Failure classifications

Recovery errors are bounded and redact provider/tool details. The main classifications cover target verification, snapshot, application/Auth export, unsupported Auth state, inventory/fingerprint/manifest, encryption, upload/remote verification, plaintext cleanup, stale recovery point, restore target/manifest/decryption/Auth compatibility/data/reconciliation/security. External process errors report only exit status and withheld-output byte counts; commands, URLs, passwords, row bodies, tokens, and Auth content are not logged.

## Gate status

Stage 2 does not clear `PRODUCTION_CUSTOMER_DATA_ONBOARDING_BLOCKED_BY_BACKUP`. Commit readiness requires repository verification, but onboarding readiness additionally requires a real encrypted Production recovery point in R2, independent readback, alerting/heartbeat, and a successful timed isolated restore rehearsal demonstrating the recovery point, identity invariants, relational invariants, security invariants, RPO, and RTO.
