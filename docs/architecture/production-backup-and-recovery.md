# Production backup and recovery

Status: Task 050 Stage 4.1 repository implementation. Provider infrastructure is provisioned, but the automation remains disabled and no real Production recovery point has been created. Customer onboarding remains blocked by the backup gate.

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

The authoritative data allowlist is centralized in `apps/web/scripts/recovery/contracts.ts`: all 39 `public` application tables plus `auth.users` and `auth.identities`. The resulting archive remains exactly 41 data tables. The tool rejects application inventory drift and archive entries outside this set. Auth schema discovery uses an explicit recovery taxonomy: durable included identity data, known transient excluded state, known durable unsupported features, platform-managed excluded metadata, and unknown tables. Unknown tables fail closed even when empty; known durable unsupported MFA, SSO, OAuth, SAML, or WebAuthn feature state blocks backup when non-empty.

Known transient state is permitted even when non-empty but never queried for payload content, dumped, fingerprinted, included in the manifest, or restored. This includes sessions, refresh and one-time tokens, flow/challenge state, `oauth_client_states` used by in-flight OAuth PKCE callbacks, and `saml_relay_states` used by in-flight SAML requests. Disaster recovery intentionally does not preserve active authentication transactions: affected users start authentication again after recovery. These transient tables must not be confused with durable OAuth client registrations, SAML/SSO provider configuration, MFA enrollment, or WebAuthn credentials, which retain the fail-closed durable-feature guard. Supabase platform migration, instance, and Auth audit metadata are also recognized but excluded from application recovery authority.

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

Restore is deliberately fail-closed and ordered. The presence of recognized transient OAuth/SAML flow tables in the source or target Auth schema does not affect durable `users`/`identities` compatibility, and restore never inserts their historical rows:

1. verify the isolated foundation and exact captured Auth column/type/nullability contract;
2. apply repository migrations and compare the migration contract;
3. restore `auth.users`;
4. restore `auth.identities`;
5. restore `public` tables in discovered foreign-key topological order;
6. reconcile owned sequences;
7. recompute all fingerprints and counts;
8. verify public/Auth UUID and canonical email relationships, validated foreign keys, and the Task 047 application security audit.

No SMTP, invite, hook, job, or other network side effect is part of restore. Any failure stops later phases. The disposable target may then be destroyed; the tool does not attempt risky automatic repair or continue from ambiguous partial state. FK cycles are rejected for review rather than worked around by disabling constraints.

## Provisioned provider infrastructure

Task 050 Stage 3 provisioned the private, EU-jurisdiction `madrasio-production-backups` R2 bucket. Public development access and custom domains are disabled. Objects under `frequent/` have matching eight-day Bucket Lock and lifecycle rules; objects under `weekly/` have matching 92-day rules. The backup writer is limited to Object Read & Write on this bucket. A distinct recovery credential is limited to Object Read on the same bucket and is not available to CI.

The Production age recipient is public CI configuration. Its private identity has two independently controlled operator copies and is absent from GitHub, Cloudflare, Vercel, Supabase, and the repository. A non-database encrypted fixture proved conditional creation, remote readback, byte and SHA-256 equality, read-only recovery scope, and offline decryption. The retained fixture expires normally under the `frequent/` policy.

Cronitor replaces the originally proposed Healthchecks.io integration because operator authentication to Healthchecks.io was unreliable. The `madrasio-production-backup` heartbeat monitor expects one verified recovery point every four hours with one hour of grace, in its Production environment. Its telemetry URL is the GitHub Production secret `BACKUP_HEARTBEAT_URL`. Two healthy Stage 3 fixture events are retained as audit evidence: the browser-reported first request appeared locally blocked but reached Cronitor, and the explicit verification request produced the second event. Neither event represents a real Production backup.

## Production backup automation

`.github/workflows/backup-production.yml` is the sole Production backup workflow. It supports explicit manual dispatch and two future schedules:

- frequent recovery attempts at minute 23 every four hours;
- an additional weekly recovery point at 02:47 UTC each Sunday.

Scheduled events are fail-closed behind the Production environment variable `PRODUCTION_BACKUP_AUTOMATION_ENABLED`. Missing, blank, or any value other than exact `true` produces only a safe disabled notice; it does not check out code or receive database, R2, encryption, or heartbeat inputs. Stage 4.1 does not create or enable this variable. Manual Stage 4.2 acceptance instead requires exact `BACKUP_PRODUCTION`, an explicit `frequent` or `weekly` retention class, and a lowercase 40-character SHA that is both an ancestor of `main` and has a successful exact-SHA CI run.

The workflow uses `contents: read` and `actions: read`, the existing GitHub `Production` environment, the non-cancelling `production-backup` concurrency group, and a bounded 60-minute backup job. It checks out the requested SHA so the recovery implementation and migration contract come from the same revision recorded in the encrypted manifest.

PostgreSQL tools run from the immutable Docker Official Image `postgres:17.6-bookworm` pinned by digest. Only `/tmp` is mounted, and `PG*` values are passed as container environment variables rather than command arguments. The official age 1.3.1 Linux archive is pinned to its reviewed SHA-256 before extraction. CI receives only the public age recipient; decryption keys never enter the workflow.

The R2 adapter uses built-in Node cryptography to create AWS Signature Version 4 requests, so no transport dependency was added. It requires the reviewed HTTPS R2 endpoint and private bucket name, uploads a collision-resistant key beneath the selected retention prefix with `If-None-Match: *`, and refuses overwrite/collision responses. Credentials remain step-local GitHub secrets and are never placed in command arguments, artifacts, summaries, or logs.

After upload, the adapter first validates remote length and the stored ciphertext checksum metadata, then downloads the complete ciphertext to a separate runner-local path. Success requires the downloaded byte count and independently calculated SHA-256 to equal the local ciphertext. Only then is `PRODUCTION_BACKUP_RECOVERY_POINT_VERIFIED` established and a Production Cronitor SUCCESS heartbeat sent. A heartbeat failure is reported separately and does not invalidate or delete the already verified R2 object. Earlier failures may emit a best-effort failure event, but reporting errors never replace the original backup error.

The safe job summary contains only the backup ID, retention class, source SHA, snapshot time, table/Auth counts, ciphertext size and SHA-256, immutable object key, and verification classification. Internal work directories, plaintext dump, manifest, bundle, encrypted upload copy, R2 readback, and temporary TLS files are removed through finally/`always()` cleanup. Cleanup is best effort on an ephemeral runner and is never described as secure physical erasure.

## Local test contract and limitations

Unit tests cover exact-target rejection, allowlist drift, custom archive inventory, format/checksum rejection, deterministic canonical JSON, snapshot SQL ordering, restore ordering/cycle rejection, fail-closed phases, cleanup path safety, version/age validation, reconciliation, and upload-before-heartbeat behavior. A real PostgreSQL snapshot-sharing test is opt-in through `RECOVERY_TEST_DATABASE_URL`; it proves that a consumer importing an exported snapshot observes the original row set after another connection commits a write.

Native archive/encryption and real PostgreSQL/Supabase restore rehearsal remain explicit Stage 4.2 proof requirements. Stage 4.1 tests use only deterministic fakes and local non-secret fixtures and perform no database, R2, Cronitor, Supabase, Vercel, or GitHub configuration access. A local Supabase harness must be pinned to a reviewed CLI/container version and must provide the managed Auth foundation before a rehearsal; application migrations must never create or own `auth.users`.

## Failure classifications

Recovery errors are bounded and redact provider/tool details. Backup diagnostics identify the safe phase and classification rather than collapsing every consistent-snapshot consumer into one error. The phase taxonomy separates target/tool verification, coordinator connection, read-only transaction setup, snapshot export, snapshot-consumer connection/import/query, coordinator lifetime, application/Auth inventory, fingerprints, `pg_dump` startup/connection/snapshot/archive creation, archive inspection/inventory, manifest/bundle, encryption, R2 upload/readback, heartbeat, and cleanup.

Operator-visible failures may contain only the candidate SHA, bounded classification and phase, an allowlisted five-character SQLSTATE, external-process exit code/signal, timeout boolean, and booleans stating whether database access, R2 upload, or heartbeat success began. Raw PostgreSQL messages, SQL parameters, connection URLs, usernames, passwords, CA contents, row values, emails, Auth metadata/password hashes, command lines, tool stderr, R2 credentials, age recipients, and heartbeat URLs are suppressed. `pg_dump` stderr is consumed only for a small internal classification allowlist—process startup, connection, snapshot import, or other archive failure—and is never emitted or stored in the workflow summary.

External operations are bounded. Tool verification and archive inspection use short timeouts; `pg_dump` uses a bounded fifteen-minute timeout within the workflow's sixty-minute job limit. There is no automatic retry for snapshot export/import, archive creation, R2 transport, or monitoring. One workflow attempt sends at most one terminal failure heartbeat, and success/failure telemetry are mutually exclusive. Failure telemetry contains no raw exception text.

Cleanup remains unconditional and path-validated. A cleanup failure is reported as `BACKUP_PLAINTEXT_CLEANUP_FAILED`; when another phase already failed, the primary classification is preserved and the cleanup problem is included only as a bounded warning. Production diagnostics never retain plaintext temporary artifacts for investigation.

The first live snapshot attempt, GitHub Actions run `34713293257` at source SHA `614c5b139c1b4cd8d4fd523ddaaeda96330f9c4d`, failed safely before archive completion, encryption, R2 upload, remote verification, or a success heartbeat. It created no recovery object and cleanup passed. The historical top-level `BACKUP_SNAPSHOT_FAILED` did not establish a root cause; no cause is inferred from that run. After any live failure, operators inspect the bounded phase evidence, review a concrete remediation, and obtain fresh authorization before another manual Production attempt.

## Gate status

Stage 4.1 does not clear `PRODUCTION_CUSTOMER_DATA_ONBOARDING_BLOCKED_BY_BACKUP`. The workflow is intentionally inactive until the separately authorized Stage 4.2 manual backup succeeds. Onboarding readiness additionally requires a real encrypted Production recovery point in R2, independent readback, its corresponding Cronitor heartbeat, and a successful timed isolated restore rehearsal demonstrating the recovery point, identity invariants, relational invariants, security invariants, RPO, and RTO.
