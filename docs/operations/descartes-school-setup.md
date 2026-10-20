# Descartes School — fictional STAGING acceptance prerequisites

This is a dedicated operator workflow, not the old demo seed or a reset command.
It never modifies another School, adopts an existing account, replaces a dataset,
sends invitations, or runs migrations. No hosted apply is authorized by local
implementation or by a successful dry-run.

## Offline preview

From the repository root:

```text
pnpm --filter @school/web exec tsx scripts/operator/seed-descartes-school.ts dry-run
```

This mode needs no credentials, loads no dotenv file, opens no connections and
prints only fictional/reserved data. Its Auth UUIDs are preview placeholders;
apply uses the exact UUIDs returned by Supabase Auth Admin. The preview is not
an inspection of current hosted STAGING state.

Dataset identity is `descartes-2026-v1`, with a fixed deterministic School UUID.
The name is Descartes School; timezone Africa/Casablanca; currency MAD. Morocco
is descriptive only: no country or School-language column is introduced.

| Prerequisite | Count |
| --- | ---: |
| School / Academic Year / Academic Periods | 1 / 1 / 2 |
| Stage / Levels / Classes / Subjects | 1 / 6 / 12 / 6 |
| Curricula / active versions / curriculum-subject links | 6 / 6 / 36 |
| Students / dated active enrollments | 276 / 276 |
| Parents / active ParentStudent relationships | 240 / 276 |
| Teachers / dated active assignments | 6 / 72 |
| Auth identities / matching Users / active memberships | 12 / 12 / 12 |
| Rooms / school-wide week configuration | 15 / 1 |
| Grading configuration / active version | 1 / 1 |
| Fee types / school-wide fee structures | 4 / 4 |

Each Class has 23 Students. Exactly 204 Parents have one child, 36 have two;
each Student has one active relationship. Five Parents have logins, including
`parent-205`, who has two children. All six Teachers and one dedicated School
Admin have logins. Other Parents have no application User or Auth account.
All names and dates are generated fictional examples, not customer records.

The active 2026/2027 year is September 1 through May 30. Premier semestre is
ACTIVE, September 1–January 31; Deuxième semestre is PLANNED, February 1–May 30.
Curriculum coefficients are 1.00. Grading uses maximum 10, pass 5, equal
assessment weighting, curriculum-weighted Period averages, simple Annual
averages and HALF_UP rounding to two decimals (ADR-011 / existing engine).

The Monday–Friday template has morning lessons 08:30–09:20, 09:20–10:10,
10:30–11:20, 11:20–12:10; lunch 12:10–13:30; afternoon lessons 13:30–14:20,
14:20–15:10, 15:25–16:15. Breaks are explicit. Six specialist Teachers cannot
cover 12 simultaneous Classes: 210 teacher-slots versus 420 class-slots/week.
The workflow does not claim a conflict-free full schedule. Teaching loads,
drafts, lessons and publications remain for manual UI acceptance.

Fees are Assurance scolaire 500 MAD ONCE; Frais d'inscription 1,500 MAD ONCE;
Transport scolaire 700 MAD MONTHLY; Frais de scolarité 2,500 MAD MONTHLY.
Amounts use integer centimes. One-time due date is September 1; monthly periods
are September 2026–May 2027 inclusive, due on the first of each month.

## Language and login

Account emails are the 12 fixed reserved `example.test` identities in the preview.
Do not substitute real recipients. Operator-supplied passwords are distinct,
16–128 characters, supplied only through the protected process environment.
They are never printed, written to a receipt, or placed in argv.

Provisioning uses `auth.admin.createUser` with `email_confirm: true`, never
signup/invite/password-reset/generateLink and never SQL Auth inserts. Before
separate apply approval the operator must verify that no configured Auth hooks
or integrations send mail on Admin user creation. Without that assurance stop.
The account metadata records fictional ownership and `preferred_locale: fr`;
metadata grants no roles or tenant authority (ADR-018/019, ADR-007/009).

Madrasio's actual language authority remains the `MADRASIO_LOCALE` browser
cookie. Select Français before logging in on each acceptance browser/profile.
Auth metadata does not override an existing cookie or implement cross-device
language synchronization. No new stored preference column is added.

## Separately authorized apply prerequisites

Use the existing ignored operator configuration/secret-injection mechanism;
this command does not automatically load `.env.local`. Never paste values into
shell history or use a public environment variable for a secret.

Required variable names (values containing credentials are intentionally omitted):

- `DESCARTES_TARGET_ENV` = `staging`;
- `STAGING_EXPECTED_PROJECT_REF` = `cqeaxlttezunirsmkrxz`;
- `SUPABASE_URL` = `https://cqeaxlttezunirsmkrxz.supabase.co`;
- `MIGRATION_DATABASE_URL`: that project's eu-central-1 Session Pooler, port
  5432, database postgres, exact `postgres.<ref>` username, no URL query options;
- `DATABASE_SSL_CA`: the verified trusted CA certificate;
- `SUPABASE_SECRET_KEY`: existing operator-only STAGING Auth Admin credential;
- `DESCARTES_PASSWORDS_JSON`: JSON mapping all 12 manifest account keys to
  distinct strong passwords;
- `DESCARTES_CONFIRMATION` = `CREATE_DESCARTES_STAGING_ONLY`;
- `DESCARTES_SILENT_AUTH_CONFIRMED` = `ADMIN_CREATE_CONFIRMED_NO_EMAIL_HOOKS`;
- `DESCARTES_PRIVATE_CUSTODY_CONFIRMED` = `PRIVATE_EXTERNAL_DIRECTORY_VERIFIED`;
- `DESCARTES_RECEIPT_PATH`: a new absolute filename in an existing private
  directory outside the repository. On Windows, verify its ACL restricts access
  to the operator, Administrators and SYSTEM. Do not reuse an incomplete receipt.

Remove executable preloads, proxy overrides and TLS bypasses. Trusted TLS,
exact migration hashes/timestamps, complete current 30-migration/57-table chain,
authority schema and application RLS/ACL are checked before any creation.
The current STAGING schema must already include Timetable 0027–0029; this tool
will not migrate it. No Production bypass exists.

After reviewing the preview, local test results, hook settings, private custody
and target state, obtain separate owner approval for precisely this dataset and
12 silent Auth creations. Only then execute once:

```text
pnpm --filter @school/web exec tsx scripts/operator/seed-descartes-school.ts apply
```

The workflow takes a School-dataset advisory transaction lock and verifies fresh
Auth/application state. It checks only the 12 exact reserved Auth emails using
read-only operator SQL and verifies any returned UUID through Auth Admin;
it never scans the Auth directory or adopts an unrelated account (ADR-019).
It journals every Auth attempt before sending, creates
the 12 confirmed identities, inserts all application prerequisites atomically,
and checks the exact full dataset and zero operational rows before commit.
Existing School/User identities are never silently adopted.

An exact completed rerun verifies identity eligibility, matching UUID/email,
every configured field, membership, relationship and count, then returns
`already-complete` without creating anything. A partial or changed dataset,
later operational data, or conflicting name/UUID requires reconciliation; there
is no repair/reset/force option. Normal manual UI activity may therefore make
later seed reruns intentionally refuse.

## Failure and verification

Auth and PostgreSQL cannot share a transaction. On provider timeout, process
failure, SQL rollback or uncertain commit, stop and retain the receipt. Do not
retry with a new receipt, resend, delete identities, or repair rows. Successful
Auth creations may remain without application rows if SQL fails; the receipt
preserves their exact IDs. Read-only operator reconciliation must compare Auth,
database and receipt before separately approving any cleanup. The workflow
deliberately performs no automatic Auth deletion or ambiguous-write retry.

The final receipt distinguishes `database-commit-pending` from
`database-commit-confirmed`. Failure to persist confirmation after commit is an
ambiguous operator result, not permission to rerun mutations.

Post-apply verification: run the same guarded workflow only after inspecting a
completed receipt; its exact-state path returns `already-complete`. Verify the
12 logins and School selection manually, School Admin settings, six Teacher
assignment scopes, and the five Parents' authorized children (including siblings).
Keep unrelated Schools unchanged. Check that attendance, homework, grading work,
announcements, notifications/outbox, financial charges/payments/receipts and
Timetable loads/drafts/lessons/publications remain empty for this School.
Do not count manual authenticated UI acceptance as completed by the seed.
