# Production backup and recovery

Status: Task 050 Stage 6 STAGING/local recovery acceptance is complete through reconstructed evidence after the original manual lifecycle was interrupted. The recovery format and isolated restore path have been proven against a real STAGING bundle, but Production automation remains disabled and no real Production recovery point has been created. Customer onboarding remains blocked by the Production backup gate.

## Recovery objective and authority

The accepted target is an application-controlled recovery point at least every six hours (RPO target: 6 hours) and a rehearsed restoration within eight hours (RTO target: 8 hours). Stage 6 now proves the repository-owned restore mechanism and its data, Auth identity, relational, migration, and application-security reconciliation against a real STAGING recovery bundle restored into an isolated local target. The Production RPO remains unproven because no real Production recovery point or active Production backup automation exists. The RTO target has meaningful STAGING/local rehearsal evidence but is not yet accepted as a Production operational objective because the original end-to-end Stage 6 manual lifecycle was interrupted and no timed Production restore has been completed.

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

The authoritative data allowlist is centralized in `apps/web/scripts/recovery/contracts.ts`: all 39 `public` application tables plus `auth.users` and `auth.identities`. The resulting archive remains exactly 41 data tables. The tool rejects application inventory drift and archive entries outside this set. Auth schema discovery uses an explicit recovery taxonomy: durable included identity data, known transient excluded state, known durable unsupported features, platform-managed excluded metadata, and unknown tables. Unknown tables fail closed even when empty. Known durable unsupported feature tables may be present only while empty; any rows fail closed with `BACKUP_AUTH_FEATURE_STATE_UNSUPPORTED` before a successful bundle can be produced.

The durable Auth recovery contract has three operational classes. Supported durable recovery state is limited to `auth.users` and `auth.identities`. Known transient state remains excluded as described below. Known durable but unsupported provider feature state includes the explicitly reviewed MFA enrollment and recovery-code tables (`mfa_factors`, `mfa_recovery_code_sets`, and `mfa_recovery_codes`), SCIM provisioning tables (`scim_tokens` and `scim_users`), and the existing OAuth, SAML, SSO, WebAuthn, hook, and custom-provider tables in the repository taxonomy. Empty known-unsupported tables are compatible with backup because they contain no omitted durable state, but they are never dumped, fingerprinted as recovery payload, placed in the manifest table inventory, or restored. Non-empty state blocks backup. Future provider tables remain unknown until explicitly reviewed and therefore block backup regardless of row count.

Known transient state is permitted even when non-empty but never queried for payload content, dumped, fingerprinted, included in the manifest, or restored. This includes sessions, refresh and one-time tokens, flow/challenge state, `oauth_client_states` used by in-flight OAuth PKCE callbacks, and `saml_relay_states` used by in-flight SAML requests. Disaster recovery intentionally does not preserve active authentication transactions: affected users start authentication again after recovery. These transient tables must not be confused with durable OAuth client registrations, SAML/SSO provider configuration, MFA enrollment, or WebAuthn credentials, which retain the fail-closed durable-feature guard. Supabase platform migration, instance, and Auth audit metadata are also recognized but excluded from application recovery authority.

## Backup safety and consistency

`pnpm recovery:backup:production` requires the existing exact Production guard:

- `DEPLOY_TARGET_ENV=production`;
- exact Production project ref supplied through the deployment contract;
- Frankfurt Session Pooler on port 5432;
- official CA material and certificate/hostname verification;
- no insecure TLS override.

It rejects STAGING, loopback, port 6543, ambiguous refs, missing CA, and plaintext fallback. Database credentials are supplied to native tools through `PG*` environment variables, not command arguments.

### Guarded Production and STAGING bundle entrypoints

Recovery artifact construction is implemented once in the internal `createRecoveryBundle` core. The core owns the exported-snapshot, inventory, fingerprint, custom-archive, manifest, V1 bundle, encryption, and plaintext-cleanup sequence. It does not select an environment, expected project ref, application origin, object-store destination, or heartbeat target.

The existing `createProductionRecoveryBundle` wrapper remains the only Production bundle entrypoint. It retains the exact Production Session Pooler/project/TLS guard, fixes `source.environment` to `production`, fixes the Production provider contract, and accepts the existing caller-selected encrypted output used by the Production R2 orchestration. `run-production-backup` remains responsible for immutable R2 upload, independent readback, and the terminal Cronitor heartbeat; none of those effects are part of the shared core.

Task 050 Stage 6 uses the separate `pnpm recovery:bundle:staging` wrapper. It requires `DEPLOY_TARGET_ENV=staging`, exact `STAGING_EXPECTED_PROJECT_REF=cqeaxlttezunirsmkrxz`, the STAGING Session Pooler on port 5432, the approved STAGING HTTPS origin, and verified TLS. `DATABASE_SSL_CA` must be supplied through ignored operator-local configuration using the approved public Supabase CA; TLS verification must never be disabled for hosted STAGING. The wrapper fixes `source.environment` to `staging` and the exact guarded project ref, accepts only an ephemeral Stage-6 age public recipient, and creates its ciphertext in a generated operating-system temporary workspace. Callers cannot choose a persistent STAGING output directory. The returned workspace has an explicit bounded cleanup helper.

The STAGING wrapper has no R2, Cronitor, scheduling, GitHub, or provider-configuration dependency. Its output is a local `madrasio-recovery-v1` ciphertext only. It uses the same 39 application tables, durable `auth.users` and `auth.identities`, transient/unsupported Auth classification, PostgreSQL 17.6 snapshot contract, migration metadata, manifest checksums, bundle writer, and age encryption as Production. A loopback-only, test-injected target is permitted solely by the opt-in local integration harness; both hosted wrappers continue to require their verified CA and exact provider target.

The coordinator starts one `REPEATABLE READ READ ONLY` transaction, fixes UTC, exports a PostgreSQL snapshot, and remains open until every consumer completes. `pg_dump`, inventory, source counts, primary-key hashes, content hashes, Auth schema metadata, and status data therefore use the same source state. The exported snapshot token is ephemeral runner-local metadata and is neither logged nor bundled.

The archive command is native PostgreSQL 17 custom format (`-Fc`), data-only, with every table explicitly supplied and ownership/privileges/comments excluded. `pg_restore --list` must contain exactly the allowlisted table-data entries and no DDL/ACL/provider state. Production server major is 17; `pg_dump` may not be older. The reviewed tool set is PostgreSQL 17.6, age 1.3.1, and Supabase CLI 2.111.0 for a future pinned disposable local Supabase harness. Floating `latest` tooling is forbidden. A future binary bootstrap must use an authoritative HTTPS source plus a committed reviewed checksum; Stage 2 does not silently download tools.

Containerized PostgreSQL tools treat host and container paths as separate concepts. The generated recovery workspace is mounted at `/madrasio-recovery`, writable only for archive creation and read-only for inspection/restore. For a hosted `verify-full` connection, the generated `madrasio-pgssl-*` directory is mounted separately and read-only at `/madrasio-pgssl`; libpq receives `/madrasio-pgssl/root.crt`, never the Windows or POSIX host CA path. The command runner validates the generated directory and exact `root.crt` file before launch and rejects missing trust material, path escape, TLS modes other than `verify-full`, or a CA supplied with verification disabled. Loopback-only disposable targets remain the sole `sslmode=disable` exception.

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

### Deterministic local recovery target

On the reviewed Windows recovery workstation, Supabase CLI 2.111.0 was observed to publish its local Kong and PostgreSQL ports on `0.0.0.0` and `[::]` even when the selected Docker bridge network set `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`. That CLI-created target was rejected. This is a record of the observed CLI/workstation behavior, not a claim about every Supabase CLI installation.

Stage 5 recovery targets therefore use the repository-owned `recovery:target:local` helper and Docker directly; `supabase start` is not the recovery-target provisioner. The minimal stack pins the reviewed Supabase PostgreSQL 17.6.1.156 and GoTrue 2.194.0 images by immutable digest. PostgreSQL provides the Supabase database foundation and GoTrue applies and serves the provider-managed Auth schema. PostgREST, Kong, Studio, Realtime, Storage, Analytics, Edge Runtime, and mail services are intentionally absent because database/Auth restoration does not require them.

Each invocation creates a fresh random target identifier, dedicated bridge network, labeled database volume, synthetic local database/JWT credentials, and temporary state outside the repository. PostgreSQL and the local Auth health endpoint are each published with explicit `127.0.0.1:<port>:<container-port>` syntax; the Auth port exists only so the provisioner can verify the real GoTrue health endpoint. The bridge network's loopback default is defense in depth, not the source of authority. Startup fails closed unless Docker inspect and the operating-system socket table both show only IPv4 loopback bindings; a supplementary connection attempt through non-loopback local interfaces must also fail when such an interface is available. Firewall-only mitigation, daemon-wide Docker binding changes, and IPv6 wildcard publication are not accepted.

The helper labels every owned Docker object and cleanup validates that label before removing the exact containers, volume, network, and generated temporary state. Startup failure invokes the same bounded cleanup path. Disposable credentials are written only to the target's temporary state with restrictive file permissions where supported and are never committed or printed. The target uses no hosted Supabase settings, SMTP, callbacks, provider credentials, Production/STAGING JWT material, or public Internet service after the pinned images are available.

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

Recovery errors are bounded and redact provider/tool details. Backup diagnostics identify the safe phase and classification rather than collapsing every consistent-snapshot consumer into one error. The phase taxonomy separates target/tool verification, coordinator connection, read-only transaction setup, snapshot export, snapshot-consumer connection/import/query, coordinator lifetime, application/Auth inventory, fingerprints, `pg_dump` startup/connection/snapshot/archive creation, archive inspection/inventory, migration metadata, server metadata, manifest validation/write, bundle checksums/write, encryption, R2 upload/readback, heartbeat, and cleanup.

Operator-visible failures may contain only the candidate SHA, bounded classification and phase, an allowlisted five-character SQLSTATE, a fixed safe external-tool cause, external-process exit code/signal, timeout boolean, and booleans stating whether database access, R2 upload, or heartbeat success began. Safe tool causes distinguish authentication, DNS/network/server, snapshot, filesystem/permission, unavailable TLS CA, TLS verification, and unknown failures. Raw PostgreSQL messages, SQL parameters, connection URLs, usernames, passwords, CA paths/contents, row values, emails, Auth metadata/password hashes, command lines, tool stderr, R2 credentials, age recipients, and heartbeat URLs are suppressed. `pg_dump` stderr is consumed only for this bounded internal classification and is never emitted or stored in the workflow summary.

The Stage 6.5 hosted STAGING lifecycle exposed a Windows-host/Linux-container trust-path defect: the prior runner generated a valid host `root.crt` and set `PGSSLROOTCERT` to its Windows path, but mounted only the archive workspace. Linux `pg_dump` therefore could not see the trust file; the previous bounded classifier reported only `BACKUP_ARCHIVE_CREATION_FAILED`. The corrected contract mounts the generated TLS directory separately, translates `PGSSLROOTCERT` to its deterministic container path, and retains `BACKUP_ARCHIVE_CREATION_FAILED` externally while reporting only the safe internal cause. No recovery-format or restore-algorithm change was required.

A later Stage 6.5 lifecycle completed its hosted fixture and source verification but stopped before the shared bundle returned an artifact. The temporary operator orchestration invoked `age-keygen` directly before `createStagingRecoveryBundle`; an `ExternalToolError` at that boundary was not a `RecoveryError` and therefore collapsed to `RECOVERY_OPERATION_FAILED`. A second lifecycle proved the shared helper still launched bare `age-keygen` and therefore remained dependent on the workstation `PATH`; with age excluded, the failure reproduces as `BACKUP_ENCRYPTION_FAILED` in `key_generation`. Recovery command execution now has one optional `RECOVERY_AGE_TOOL_DIRECTORY` resolver for both `age` and `age-keygen`: the value must be an absolute operator/runner-supplied directory, the logical executable name is appended with platform-native semantics, and no user-specific path is committed. The helper derives the recipient through the reviewed `age-keygen -y` interface rather than parsing platform-specific key-file line endings. Missing executables are reported only as bounded `toolCause: unavailable`, without paths or stderr. CI may continue providing verified age 1.3.1 through `PATH`; local Stage 6 uses the same pinned binaries through the explicit directory contract.

External operations are bounded. Tool verification and archive inspection use short timeouts; `pg_dump` uses a bounded fifteen-minute timeout within the workflow's sixty-minute job limit. There is no automatic retry for snapshot export/import, archive creation, R2 transport, or monitoring. One workflow attempt sends at most one terminal failure heartbeat, and success/failure telemetry are mutually exclusive. Failure telemetry contains no raw exception text.

Cleanup remains unconditional and path-validated. A cleanup failure is reported as `BACKUP_PLAINTEXT_CLEANUP_FAILED`; when another phase already failed, the primary classification is preserved and the cleanup problem is included only as a bounded warning. Production diagnostics never retain plaintext temporary artifacts for investigation.

The first live snapshot attempt, GitHub Actions run `34713293257` at source SHA `614c5b139c1b4cd8d4fd523ddaaeda96330f9c4d`, failed safely before archive completion, encryption, R2 upload, remote verification, or a success heartbeat. It created no recovery object and cleanup passed. The historical top-level `BACKUP_SNAPSHOT_FAILED` did not establish a root cause; no cause is inferred from that run.

The second live diagnostic attempt, run `34764687063` at source SHA `3098838705cf8c3c0373b53466b82f4538199329`, established that the verified-TLS connection, read-only exported snapshot, snapshot consumption, Auth/application inventory, source fingerprints, `pg_dump --snapshot`, custom archive creation, archive inspection, and exact archive inventory all succeeded. It then failed with `BACKUP_MANIFEST_FAILED` in the former broad `manifest_bundle` phase. It created no encrypted recovery object, sent no success heartbeat, sent one bounded failure heartbeat, and cleaned up successfully.

Local reconstruction exposed a deterministic V1 backup-ID bug at that boundary: `createBackupId` removed only a literal `.000` fraction, so a normal PostgreSQL transaction timestamp with non-zero milliseconds produced `YYYYMMDDTHHMMSS.sssZ-...`, which the established whole-second V1 backup-ID schema correctly rejected. The implementation now normalizes any ISO millisecond fraction to the established `YYYYMMDDTHHMMSSZ-...` representation; the recovery format remains `madrasio-recovery-v1` and validation is not weakened. Empty-Production-shaped and synthetic non-empty manifests now round-trip through the current bundle reader.

Migration discovery now walks upward from the runtime working directory to the repository-owned migration journal instead of assuming one package-relative current directory. The resulting path is never emitted in hosted diagnostics. Manifest/bundle failures are separated into `BACKUP_MIGRATION_METADATA_FAILED`, `BACKUP_SERVER_METADATA_FAILED`, `BACKUP_MANIFEST_VALIDATION_FAILED`, `BACKUP_MANIFEST_WRITE_FAILED`, `BACKUP_BUNDLE_CHECKSUM_FAILED`, and `BACKUP_BUNDLE_WRITE_FAILED`. Validation errors expose neither rejected values nor raw Zod issues, and filesystem failures expose neither temporary absolute paths nor file contents. After any live failure, operators inspect only the bounded phase evidence, review a concrete remediation, and obtain fresh authorization before another manual Production attempt.

The subsequent read-only hosted preflight found that node-postgres returns `SHOW server_version` as `{ server_version: string }`, while the initial local mock used a non-native `version` property. The loader now consumes only the native `server_version` field, requires a row and a string, trims it, rejects empty or malformed shapes as `BACKUP_SERVER_METADATA_FAILED`, and never serializes the returned row. PostgreSQL server metadata remains runtime input; the PostgreSQL client version remains a separately pinned recovery-tool contract.

During that preflight, the complete Cronitor telemetry URL was rendered by the provider inspection surface. The credential value is intentionally not recorded here. Rotation is mandatory before another Production backup, and future monitoring verification must inspect only bounded monitor configuration/status without rendering or copying the telemetry URL.

## Stage 6 acceptance evidence — 2026-09-22

The final Stage 6 evidence came from one real hosted-STAGING recovery lifecycle
whose original operator orchestration was interrupted after source verification
and bundle creation. The original runner therefore did **not** itself emit
`STAGE_6_RESULT: PASS`. Acceptance was reconstructed without repeating the
hosted mutation by combining the already-captured source evidence, the exact
preserved encrypted bundle, one isolated restore, independent semantic
verification, and bounded cleanup.

The source recovery evidence used repository SHA
`d499d1996151fff789d50ca8bf638d6a0a66ca44` and produced backup
`20260922T030909Z-d499d1996151-a7ec79b36fa64be5`. The preserved ciphertext was
55,290 bytes with SHA-256
`5d5afe2b0952c2aaed1761d1a217dc576ec8d4f7a11e06a59d68a8ed25781d3d`.
Its matching external age identity was confirmed with age 1.3.1.

The exact preserved bundle was restored once into a fresh loopback-only local
recovery target. The restore emitted `isolated_restore_verified` for all 41
manifest tables. That success occurs only after the repository migration
contract, restored table counts/fingerprints, identity/relationship
reconciliation, and application-security audit complete successfully.

A separate read-only semantic verification of that restored target confirmed:

- 8 `auth.users`;
- 8 `auth.identities`;
- 39 public application tables;
- 16 Drizzle migrations;
- 39 RLS-enabled application tables;
- zero application RLS policies;
- exact Teacher Auth / `public.users` UUID identity preservation;
- exact Parent Auth / `public.users` UUID identity preservation;
- expected School/membership/profile relationships;
- expected Student/enrollment/Class/AcademicYear relationships.

The complete `auth.users` fingerprint reconciliation also covers the restored
encrypted-password row content at the table-fingerprint level. The interrupted
operator process did not emit its original explicit password-hash comparison
labels, so those labels must not be retroactively claimed.

Cleanup was independently completed and verified after the interrupted
lifecycle:

- the hosted STAGING fixture application rows were removed;
- the two exact temporary STAGING Auth identities were removed;
- STAGING returned to its accepted baseline;
- the interrupted local recovery target was removed;
- the successful restored local target was removed;
- the preserved encrypted bundle was removed;
- the matching ephemeral age identity was removed;
- temporary recovery workspaces were removed;
- temporary Stage 6 operator scripts were removed.

No second real restore, new Stage 6 STAGING fixture, additional hosted cleanup,
or recovery-artifact reconstruction is required or authorized by this evidence.

The real restore also exposed a Windows package-manager launcher portability
issue. In the operator environment, pnpm 11.22.0 did not populate
`npm_execpath`; supplying the existing absolute `pnpm.cjs` launcher allowed the
restore to complete. That manual environment workaround proves the restore path
but is not the permanent repository fix. `resolvePnpmInvocation()` still
requires a narrowly scoped, fail-closed Windows hardening that must not fall
back to shell execution or blindly execute `.cmd` shims.

Stage 6 therefore establishes the real STAGING-to-isolated-local recovery
mechanism and reconciliation contract. It does **not** clear the Production
customer-data onboarding block: no real Production encrypted recovery point,
active Production backup cadence, independent Production readback, or timed
Production restore has yet been accepted.

## Gate status

Stage 6 STAGING/local recovery acceptance does not clear `PRODUCTION_CUSTOMER_DATA_ONBOARDING_BLOCKED_BY_BACKUP`. Production backup automation remains inactive and no real Production recovery point has been accepted. Onboarding readiness still requires a real encrypted Production recovery point in R2, independent readback, its corresponding Cronitor heartbeat, and a successful timed isolated Production restore rehearsal demonstrating the recovery point, identity invariants, relational invariants, security invariants, RPO, and RTO.
