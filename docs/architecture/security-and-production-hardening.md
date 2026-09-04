# Security and Production Hardening

## Task 047 scope and status

Repository implementation and read-only STAGING audit. Starting commit:
`ae41bbd0ace6c02b213a9e007caa82d0655325b6` (`main`). No provider settings,
hosted migrations, deployments, credentials, Cron jobs or business rows are
changed in this pass. Production remains out of scope.

The hosted baseline is still Task 046: 15 migrations through `0014`, 39 tables,
STAGING project `cqeaxlttezunirsmkrxz`, and the dedicated Vercel STAGING origin
`https://school-management-system-staging.vercel.app`. Migration `0015` is
**local and unapplied**. Do not run the updated deployment gate against the old
schema expecting a pass.

## Threat boundaries

Browser → Next.js → current-context authorization → application services →
Drizzle → PostgreSQL remains the only application-data path. Supabase Auth
authenticates; application User, membership and academic/relationship scope
authorize. ADR-018/019 identity invariants and absence of Student Auth remain.

Data API stays OFF. All application tables have RLS enabled and zero application
policies. RLS is not the server authorization system: the current direct DB
owner bypasses it. Never expose that connection or an elevated Auth client to
the browser. No browser-direct REST/GraphQL application repository is added.

## Read-only privilege findings

The inspected session and application object owner were `postgres`. It is not a
superuser, but has BYPASSRLS. All 39 public application tables were owned by it.
Each of `anon`, `authenticated`, and `service_role` had SELECT, INSERT, UPDATE,
DELETE, TRUNCATE, REFERENCES and TRIGGER on all 39 tables. This is unnecessary
even with Data API OFF; the elevated key is used for Auth Admin, not business
table access. All 39 tables had RLS enabled, with zero policies.

There were **zero public sequences and zero repository application functions**.
The one public function, `rls_auto_enable()`, is Supabase platform infrastructure.
It has PUBLIC/client EXECUTE and is deliberately preserved, not treated as an
application function merely because its owner is `postgres`.

`postgres` public-schema defaults granted broad table, sequence and function
privileges to all three API roles. Global default function EXECUTE to PUBLIC
also applies even without an explicit global `pg_default_acl` row. Public schema
USAGE was granted to PUBLIC/API roles; no unintended PUBLIC CREATE was observed.
Schema USAGE is not table DML and remains unchanged. Defaults in storage/auth/
cron/extensions/GraphQL/realtime and other creators are not blanket-revoked.

## Migration 0015 and verification

`0015_data-api-grants-hardening` was generated as one custom Drizzle migration.
It asserts the audited creator/ownership, enumerates the exact 39 application
tables, enables RLS without policies, and removes their PUBLIC/API-role grants.
There are no current application sequence/function grants to revoke. An
unexpected application sequence fails closed rather than guessing ownership.
Existing platform functions, schemas, roles and Auth tables are untouched.

Future public tables and sequences created by `postgres` lose the unneeded
API-role defaults. **All function defaults are preserved**, including the global
built-in PUBLIC EXECUTE default and pre-existing per-schema defaults. The managed
creator also creates platform functions; changing its global function defaults
would cross application ownership. PostgreSQL per-schema defaults cannot subtract
the global default, so they are not presented as a substitute protection.

Repository invariant: every migration creating an application-owned function
MUST revoke unintended EXECUTE from PUBLIC, anon, authenticated and service_role
on the exact function signature in the SAME migration/transaction. Any justified
exception requires review and a matching verifier contract change. There are no
current application functions to revoke. Existing/future platform function
behavior and other creators' defaults remain unchanged.
See [PostgreSQL default-privilege semantics](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).

The shared read-only security query extends `verify:staging-migration`: expected
journal count 16/latest `0015`, 39 tables, canonical User email, owners, RLS,
zero policies, direct/effective API table privileges, sequence grants, and
global/public-schema table/sequence defaults. Application-function checks inspect
postgres-owned public functions, excluding the known platform event-trigger
signature and extension-owned routines. Both direct PUBLIC/API EXECUTE and
effective API EXECUTE (including inherited access) fail deployment. Function
defaults themselves are deliberately not rejected. Unknown unsafe application
functions fail verification; they are not auto-repaired.

Fresh PGlite replay tests cover ordinary and Supabase-like broad defaults,
future table/sequence probes, explicit per-function revokes, rejection of every
unintended function grantee, unchanged future platform functions, owner reads/
writes, the Auth FK and deliberate unsafe-state rejection. Security ACL/RLS
changes are custom SQL, not application model/column changes. The copied
Drizzle snapshot records unchanged application structure; the separate catalog
gate checks the security state Drizzle's snapshot does not model.

## API-key migration and environment matrix

Preferred public/session key: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
Preferred elevated Auth key: `SUPABASE_SECRET_KEY`. URLs retain existing names.
Publishable/secret keys are opaque keys, not user JWTs. HTTP preflight uses the
public key in `apikey`, not as a fabricated Bearer user JWT. Client constructors
remain Supabase SDK clients. See [Supabase API keys](https://supabase.com/docs/guides/api/api-keys).

| Variable | Classification / destination |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Public configuration; Vercel build/browser |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Intentionally public; browser and session SSR |
| SUPABASE_URL | Server URL configuration; same project |
| APP_URL / NEXT_PUBLIC_APP_URL | Origin configuration, never an authority claim |
| DATABASE_URL | Server secret; runtime Transaction Pooler :6543 |
| SUPABASE_SECRET_KEY | Server secret; Auth Admin only |
| CRON_SECRET | Server secret; Vercel and matching Vault secret |
| MIGRATION_DATABASE_URL | CI/operator secret only; Session Pooler :5432 |
| DATABASE_SSL_CA | Public CA trust material; masked as a GitHub environment secret and configured server-side in Vercel |
| VERCEL_DEPLOY_HOOK_URL | GitHub staging release secret only |
| STAGING_APP_ORIGIN | GitHub staging configuration |
| R2 credentials | Optional server secrets; not browser data |
| SENTRY_DSN | Existing optional server configuration; Task 048 owns observability |
| Bootstrap/demo credentials | Ignored operator-only fixtures; never deployed runtime |
| SMTP credentials | Future Supabase Auth configuration only, not application env |

Stage 2B completed the compatibility phase. STAGING deactivated the legacy
JWT-based `anon` and `service_role` API keys after a modern-only redeployment
and fresh browser, Auth Admin, role, database, Cron, and historical-state
acceptance. The repository now requires
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for browser/session clients and
`SUPABASE_SECRET_KEY` for Auth Admin; it does not map retired environment names
into these fields. Production must never be provisioned with the retired key
names. Elevated opaque/JWT credentials remain rejected as public/session
configuration without echoing them. Auth Admin keeps `server-only`, no session
persistence/refresh, and no business DB usage.

The database and session-server modules also have server-only import guards.
CI uses inert modern public-key placeholders and never needs hosted credentials
for PR builds. No PAT/CLI release dependency is reintroduced. Ignored local
operator environments must remove obsolete aliases and define the two modern
key names before running bootstrap, seed, or hosted verification commands.

## TLS finding and deployment prerequisite

The inspected legacy migration connection was **not encrypted** (`pg_stat_ssl`
false); configured runtime/migration URLs had no sslmode. A read-only verified
TLS probe failed with `SELF_SIGNED_CERT_IN_CHAIN` using the current Node trust
configuration. Runtime TLS was not independently proven by that migration probe.

`postgresConnectionConfig` requires certificate/hostname-verified TLS for remote
PostgreSQL. Plain connections remain possible only for loopback test databases.
`DATABASE_SSL_CA` accepts the trusted provider CA PEM; there is no
`rejectUnauthorized:false` fallback. Untrusted TLS must fail closed.

The pinned drizzle-kit URL path discards separate SSL settings, so migrations
now use structured host/database/user/password/port/ssl credentials. Unsupported
migration URL options fail rather than silently changing behavior. No URL or
secret was rewritten. All repository runtime/operator/deployment Pool factories
use the same helper. GitHub's masked staging secret `DATABASE_SSL_CA` supplies
the public trust material when required. The certificate is not a credential;
secret classification is used solely to prevent multiline PEM rendering in
operational logs.

**Do not deploy this change until trusted CA configuration is staged and verified
in both Vercel runtime and GitHub migration environments.** Obtain the provider's
trusted CA via its approved channel; do not trust a certificate merely because
an unverified endpoint presented it. Verify encrypted sessions, hostname checks
and both pooler ports. Only subsequently consider provider SSL enforcement in a
separately approved operation. No SSL enforcement setting changed here.

### Required CA preparation BEFORE commit/push

The same variable name, `DATABASE_SSL_CA`, carries PEM trust material in both
environments; real multiline PEM or literal `\\n` escapes are accepted. It is
not a password. Do not include the certificate in reports. Runtime reads it
directly in the server-only Pool factory. GitHub's `staging` environment secret
is passed by `deploy-staging.yml` to the migration process and verifier as the
ordinary process environment variable `DATABASE_SSL_CA`.
`database/drizzle.config.ts` reads it and uses structured credentials with
`ssl.rejectUnauthorized=true`; no URL parsing can replace that SSL object.

After repository approval, the operator must obtain the approved STAGING
database/pooler CA chain from Supabase and set it in:

- dedicated Vercel STAGING project, Production-target server configuration;
- GitHub `staging` environment **secret** `DATABASE_SSL_CA` (not because the CA
  is confidential, but so GitHub masks its PEM in job logs).

These are additive configuration changes compatible with the currently deployed
code, which does not consume the variable. Setting configuration before push
does not require invoking a Deploy Hook. No deployment is authorized in this pass.
Locally validate the candidate chain against BOTH the existing Transaction
Pooler :6543 and Session Pooler :5432 using this helper, bounded read-only
connections, and safe TLS success/failure output only. Do not run the migration
command to test TLS, and do not use the 0015 security gate on the still-0014
hosted schema. Verify the TLS stream is encrypted/authorized and its hostname
matches each endpoint. Never expose URLs or credentials in command arguments.

Whether one chain validates both endpoints is **not yet established**: no
approved CA has been supplied/tested. Both connection attempts must succeed
with the same configured PEM (which may contain an approved CA bundle); do not
assume shared trust solely from their shared project. Standard Node hostname
verification remains enabled; no custom permissive checkServerIdentity exists.
No `rejectUnauthorized:false`, global TLS-disable switch, encryption-only
`sslmode=require`, or remote downgrade is introduced. An input sslmode=require
is replaced with verified TLS, not accepted as encryption-only.

Commit/push approval remains gated on that provider preparation/readback. The
resulting order is CA setup → approved commit/push → validation/build → verified
TLS migration → schema/security verification → release/deploy → verified TLS
runtime acceptance. Merely changing docs or seeing the secret NAME is not
evidence of a valid CA chain. Provider settings were not changed in this review.

### Stage 1 CA log-hygiene remediation

The first successful 0015 deployment proved verified TLS on both STAGING
poolers, but GitHub rendered the public CA PEM because it was stored as an
unmasked environment variable. The same approved CA was moved, without
rotation, to the same-named GitHub `staging` environment secret and the old
variable was removed. The workflow now reads `secrets.DATABASE_SSL_CA`; the
runner, Drizzle, verifier and Node connection contracts are otherwise
unchanged. Vercel retains its existing server-side `DATABASE_SSL_CA` value.

## Auth, password and abuse controls

Read-only Dashboard audit: email provider enabled, public signup disabled,
anonymous sign-in disabled. Minimum password length is **6**, while application
set-password validation is **8–128** with confirmation. Provider policy is the
authoritative enforcement for SDK password updates; client validation alone is
not sufficient. Align the provider minimum to at least 8 after review before
claiming acceptance. No policy was changed in this pass.

Secure email change is enabled. Secure password change/recent-auth and current-
password requirements are disabled. Review those separately: blindly enabling
current-password requirements can break initial invitation password setup.
The password page requires a verified authenticated session; it is not a new
invitation-only authorization system and does not derive roles from metadata.

Leaked-password protection is disabled and Dashboard identifies it as Pro-plan
dependent. No plan upgrade is assumed. Email-link expiration was 3600 seconds,
OTP length 8. Exact project rate-limit values were not successfully captured in
this pass; operator readback is still required. No limits were raised, CAPTCHA
introduced, or abuse controls disabled. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

## SMTP/operator checkpoint and invitation acceptance

`TASK_047_SMTP_PROVIDER_OPERATOR_CHECKPOINT`: no approved SMTP provider/sending
domain is documented. Required operator decisions: provider, host/port and TLS
mode, dedicated Auth sender address/display name, domain ownership/verification,
SPF, DKIM, DMARC policy/status, and credential custody. Supply username/password
only directly to Supabase's secure configuration, never in chat/source/Vercel.
Do not invent a domain, purchase service, upgrade a plan or claim DNS validation.

The reviewable template is `docs/operations/auth-invite-template.html`. Its link
is `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite` (HTML escapes the
ampersand). The application already passes the full `/auth/confirm` URL. Never
append it again; do not interpolate user metadata or retain ConfirmationURL as
the final template. Hosted default-template limitation remains until approved
SMTP/template configuration.

After approved SMTP setup, verify actual external delivery from one canonical
SchoolAdmin invite to a safe unlinked Teacher/Parent fixture. Follow the received
HTTPS link → server verifyOtp(invite) → fixed set-password page → update password
→ logout → password login → exact /me School/role/profile scope. Do not expose
tokens, passwords or cookies. Do not substitute generateLink-only evidence for
real SMTP delivery acceptance or create duplicate permanent identities.

## HTTP/API and cache boundary

All responses receive nosniff, DENY/frame-ancestors none, no-referrer,
camera/microphone/geolocation denial, and HSTS max-age one year. No preload or
includeSubDomains claim is made for provider domains; browsers ignore HSTS on
plain HTTP development. The CSP intentionally only prevents framing, not a
pretend comprehensive script policy. A nonce-based full CSP is deferred.

API/Auth/login responses have private no-store headers; confirmation redirects
also set no-store explicitly. Invalid/expired/transport errors return a generic
fixed internal destination with token parameters removed. No arbitrary next
URL is honored. No CORS wildcard was found in application routes. Existing
machine routes retain exact/timing-safe Bearer checks and generic 401/GET405;
browser session cookies give no job authority. Health output remains limited to
existing approved health/release metadata, never connection or secret data.

## Dependency and source audit

The initial production dependency audit reported 0 Critical, 4 High and 2
Moderate advisories: drizzle-orm identifier escaping, optional sharp/libvips,
and four PostCSS advisories. No broad upgrade is made merely to zero the audit.
Current repositories use static Drizzle schema/aliases, not request-controlled
sql.identifier/sql.raw. The vendor advisory explicitly excludes static/allowlist
identifier usage. No next/image imports or custom sharp processing were found;
Next remote images are not configured. PostCSS processes repository-controlled
build styles, not uploaded/user CSS. These are retained dependency findings,
not a claim that vulnerable packages are patched. Re-evaluate before adding
dynamic identifiers, image processing or user styles. See [Drizzle advisory](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9).

### Exact production advisory inventory (repository review)

Registry audit: 4 High / 2 Moderate, exit 1; installed dependency versions are
unchanged. The following is a reachability assessment, not a patched-package claim.

| Advisory | Severity | Installed; affected range | Dependency | Fixed | Current reachability / Task 047 action |
| --- | --- | --- | --- | --- | --- |
| [GHSA-gpj5-g38j-94v9](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9) | high | drizzle-orm 0.36.4; <0.45.2 | Direct (web/database) | >=0.45.2 | No untrusted identifier/alias construction; only static schema/aliases. Accept/defer with this scope restriction. |
| [GHSA-qx2v-qp2m-jg93](https://github.com/postcss/postcss/security/advisories/GHSA-qx2v-qp2m-jg93) | moderate | postcss 8.4.31; <8.5.10 | Transitive via Next | >=8.5.10 | No user CSS parsed/stringified into HTML. Accept/defer with this scope restriction. |
| [GHSA-f88m-g3jw-g9cj](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj) | high | sharp 0.34.5; <0.35.0 | Optional transitive via Next | >=0.35.0 | No uploaded/proxied image content or configured remote images. Next optimizer exists, but no current attacker-controlled image-byte source found. Accept/defer with this scope restriction. |
| [GHSA-6g55-p6wh-862q](https://github.com/postcss/postcss/security/advisories/GHSA-6g55-p6wh-862q) | high | postcss 8.4.31; <=8.5.11 | Transitive via Next | >=8.5.12 | No runtime user CSS input to PostCSS; repository-controlled build styles only. Accept/defer with this scope restriction. |
| [GHSA-fxqj-rqcc-2cmp](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp) | moderate | postcss 8.4.31; <=8.5.22 | Transitive via Next | >=8.5.23 | No runtime user CSS input to PostCSS; repository-controlled build styles only. Accept/defer with this scope restriction. |
| [GHSA-r28c-9q8g-f849](https://github.com/postcss/postcss/security/advisories/GHSA-r28c-9q8g-f849) | high | postcss 8.4.31; <=8.5.17 | Transitive via Next | >=8.5.18 | No runtime user CSS input to PostCSS; repository-controlled build styles only. Accept/defer with this scope restriction. |

Drizzle also identifies CVE-2026-39356. PostCSS stringify identifies
CVE-2026-41305. The sharp advisory includes libvips CVE-2026-33327,
CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 and CVE-2026-69242; its current
maintainer guidance recommends sharp 0.35.3/libvips 8.18.3 even though the
registry's fixed range begins at 0.35.0. Before enabling untrusted image input,
use that reviewed fixed release, not only the minimum range. For a future narrow
PostCSS upgrade, 8.5.23 covers all four listed advisories. No realistically
reachable Critical/High path was identified in the present application.

Next's optimizer route exists even without next/image imports; absence of an
import alone is not a security boundary. Current remote allowlists are empty,
no public upload/proxy image route was found, and local images are repository
controlled. Reassess before enabling those inputs. Malicious repository code
or dependency builds are separate CI supply-chain threats, not tenant-controlled
CSS parsing; these deferrals do not authorize unreviewed packages or code.

Tracked-source scanning found no matching configured secret values or known
credential/private-key patterns. This is not a complete historical forensic
scan. Ignore local env, private PEM and .vercel state. Repeat source and compiled
client-asset scans before acceptance; never print matching values.

## Provider rollout after review — no writes authorized by this document

1. Review migration scope, tests, TLS prerequisites and this checkpoint register.
2. Obtain/validate provider CA; stage trust configuration in Vercel and GitHub.
   Verify both remote connections without disabling certificate checks.
3. Create modern public/secret keys alongside legacy keys; operator configures
   Vercel without retrieving or printing old values. Mark DATABASE_URL,
   SUPABASE_SECRET_KEY and CRON_SECRET Sensitive/write-only where supported.
   Remove/re-add conversions require controlled operator transfer and redeploy.
4. Commit/push only after approval. Existing GitHub gate builds, explicitly
   migrates 0015, verifies ACL/RLS/schema, promotes exact SHA and deploys via Hook.
   No build/install/startup migration and no Vercel automatic Git bypass.
5. Verify real browser/session Auth, elevated invitation API, direct DB and both
   Cron jobs. New-key deployment must pass before legacy usage removal.
6. Confirm legacy keys have no required usage, deactivate them, remove obsolete
   provider env, gated redeploy, and verify again. Never disable them early.
7. Align Auth minimum password policy; approve SMTP/domain, configure TLS and
   verified sender/DNS, apply template, test real delivered invitation chain.
8. Rotate CRON_SECRET only if justified: operator-controlled fresh value to
   Vercel and Vault, gated redeploy, verify both jobs and wrong/missing-secret
   401s. Coordinate the brief single-secret cutover; due work remains durable.
9. Re-audit grants, TLS, Data API OFF, all-table RLS/zero policies, identity
   invariants and preserved 2027 scheduled publication. No manual domain repair.

## Separate Production checklist / handoff

Task 049 must provision separate Supabase/Vercel projects, DB credentials,
publishable/secret keys, exact Site URL/redirect allowlist, verified Custom SMTP
sender/SPF/DKIM/DMARC, Auth password/signup policy, hardened grants, RLS/Data API
posture, verified TLS/enforcement plan, Cron/Vault secret, and release Hook.
No STAGING credentials may be reused. Legacy keys must retire only after tested
rollover. No Production resource is created here.

Task 048 owns observability/alerts/backups and log-retention/redaction assurance,
including ensuring Auth callback query tokens never enter durable request logs.
Task 047 does not add an observability vendor, invitation resend system, provider
identity redesign, RLS policy framework, or production provisioning.

## Verification record

Local verification completed on 2026-09-03:

- Frozen install, lint, workspace typecheck and production build passed.
- Full `pnpm test` passed (web: 909 passed / 3 opt-in hosted tests skipped;
  database suite passed, including fresh migration replay and backfill tests).
- After the final key-selection tests were added, the focused security/Auth/
  machine-route/deployment run passed all 42 tests across six files.
- Initial local migration security/readiness run passed seven tests; Drizzle migration
  metadata check passed. Snapshot structures 0014/0015 are deeply equal after
  excluding snapshot IDs (JSON property ordering differs).
- Canonical E2E passed four tests, including actual HTTP header/redirect checks;
  five opt-in hosted tests were intentionally skipped.
- Source/new-file scan covered 814 files and built-client scan 144 assets:
  zero configured-secret matches; `.env.example` is the only tracked env file.
  This is not a complete history scan or a claim that unknown secrets cannot exist.
- Production dependency audit remains nonzero: 4 High, 2 Moderate, 0 Critical,
  with reachability assessment above; no dependency or lockfile upgrade.

Hosted application/SMTP/key-rollover acceptance is deliberately pending explicit
provider approval. No hosted mutation suites, credential changes, provider
configuration writes, Production operations or commits were performed.

### Open findings / readiness

| Severity | Finding | Remaining action |
| --- | --- | --- |
| Critical | None observed in this scoped audit | Not a blanket security certification |
| High | Legacy inspected migration session unencrypted; verified TLS trust probe failed | Trusted CA rollout and verified runtime/migration sessions before deploying |
| High | Hosted minimum password length 6 vs application minimum 8 | Reviewed provider alignment and acceptance tests |
| Medium | Broad hosted API/default ACLs still present | Review/apply 0015 through the gated release; verify catalogs |
| Medium | Custom SMTP/template and real delivered invite unverified | Operator provider/domain decisions, secure config, delivery acceptance |
| Medium | Legacy key transition not performed | New-key acceptance before legacy retirement |
| Medium | Exact hosted Auth rate limits not captured | Read back/review without increasing limits for tests |
| Low | Full nonce CSP, leaked-password paid feature, history scan and operational monitoring limitations | Explicit future security/Task 048 review; no implied plan purchase |

Dependency advisory severities remain High/Moderate as reported by the registry;
the application reachability assessment does not relabel or erase them.
Repository corrections are ready for review, but **NOT READY FOR COMMIT/PUSH**
until the required provider CA preparation and both-endpoint trust verification
are confirmed. Task 047 hosted acceptance also remains incomplete until the
other provider checkpoints above pass.

### Narrow repository-review follow-up

Removed the creator-wide and per-schema function-default changes from the
unapplied 0015 migration. Application functions instead require same-migration,
exact-signature revokes, enforced by direct/effective execution checks in the
deployment gate. Revised security/readiness tests: nine passed, including
unchanged future platform behavior and explicit application-function revokes.
No migration was added, no historical applied migration was edited, no model
changed, and no provider operation was performed. The advisory inventory and
before-push CA checklist above supersede the initial broader-default proposal.

Follow-up verification completed: frozen install, lint, typecheck, full test
suite (database 360 passed; web 910 passed / 3 hosted tests skipped), production
build, canonical E2E (4 passed / 5 hosted tests skipped), Drizzle metadata check,
42 focused security/Auth/jobs/deployment tests, and diff check all passed.
The production audit remains exit 1 for the six explicitly inventoried advisories.
No dependency/lockfile change, hosted acceptance run or provider write occurred.
