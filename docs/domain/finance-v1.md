# Finance V1 — Student Fees and Offline Payments

Authoritative Pass 1–3 contract (FINANCE_V1_IMPLEMENT_01/02/03). Applies alongside ADR-007
(School tenant boundary), ADR-008 (enrollment placement/history), ADR-004 (Drizzle)
and ADR-023 (platform authority confers no School membership). This is student
receivables, not SaaS subscriptions or a general ledger.

- Only ACTIVE School Admin members can read/manage the Finance administration
  APIs. Verified server identity and an ACTIVE School are required for every
  operation. The approved dedicated child-scoped Parent read-only exception is
  described below; it grants no Finance permission. No Accountant role, public
  grant, Teacher access or platform-only School bypass is introduced.
- Schools configure named fee types, then monthly or one-time structures by
  Academic Year and optional Level. One active structure per exact year/type/level
  scope; a School-wide structure and a Level structure may coexist. Admins choose
  a structure explicitly; there is no implicit precedence or automatic charging.
- A structure has 1–36 explicit period/due-date pairs. Monthly identity is YYYY-MM,
  including months on either side of New Year; one-time identity is `once`.
  Periods must intersect the Academic Year and due dates must be inside it.
  One-time structures have exactly one date. Planned/active years accept
  configuration/generation; closed/archived years retain charges/history.
- At generation, recipients must be ACTIVE Students with ACTIVE enrollment in
  that Academic Year and an ACTIVE Class, within the optional structure Level.
  Current placement is authoritative for explicit Class/Level bulk selection.
  A transfer does not rewrite previous charges or create new charges. Admins may
  select earlier configured months explicitly; no enrollment-date proration is
  inferred. Full monthly amount is the default. A request for explicit students
  fails as a whole if any recipient is ineligible. Maximum 500 recipients.
- Preview includes every selected recipient/period, its due date, original amount,
  existing-charge marker and exact total for new charges only. Confirmation must
  supply the preview hash and a UUID request key. Changed configuration,
  eligibility or duplicate state requires a new preview; no silent re-preview.
- Database uniqueness is School + Student + Academic Year + Fee Type + Period,
  independent of structure revision or transferred Class. Duplicate previews
  skip existing charges, including cancelled charges; cancellation does not
  permit accidental regeneration. Repeated identical generation requests return
  the recorded batch result. A reused key with changed content conflicts.
- Money is integer minor units in the configured School currency, never floating-point arithmetic. Amounts are
  positive and at most 999,999,999 centimes. Totals remain safe integers within
  bounded batches. UI decimal input is converted using decimal-text arithmetic.
- Each School defaults to MAD and an ACTIVE School Admin can select MAD, EUR,
  USD or GBP in Finance configuration before any fee structure, charge or payment
  exists. All supported currencies have two fractional digits. Identical updates
  are idempotent; inactive structures, cancelled charges and reversed payments
  still lock the currency. Fee types alone do not lock it. No conversions occur.
- Configuration and monetary writes serialize on the same School row lock.
  Structures, charges, payments and allocations retain currency snapshots;
  same-School currency foreign keys prevent mismatches even outside the services.
  Receipts use the original payment currency; reports and CSVs identify currency.
  Additional currencies require app validation and a forward constraint migration,
  with explicit verification of a two-decimal ISO currency.
- Generated charges snapshot currency, fee name, structure revision, Class/year, period,
  due date and original amount. Structure edits affect later generation only.
  No generated-charge deletion or mutation of original amount/date/context API.
- A manual reduction is an additional positive amount, requires a reason, and
  cannot reduce the payable amount below existing allocations. Original amount
  remains immutable. Every adjustment appends actor, time, reason, previous/new
  amount and idempotency identity in the same transaction as the charge change.
- An individual reduction can be edited or cancelled while its charge is OPEN,
  including partially paid charges. Corrections append `REDUCTION_EDIT` or
  `REDUCTION_CANCEL` events; original events are never updated/deleted. They retain
  the original reduction ID, previous revision ID, individual old/new reduction,
  charge payable before/after, actor, timestamp, reason and request identity.
  Cancelled individual reductions cannot be revived; a new explicit reduction
  may be applied separately. Other reductions, original amounts, payment and
  allocation records and receipt snapshots remain unchanged.
- Correction requests require confirmation and the displayed revision ID. The
  School/charge locks serialize corrections with payments and other adjustments;
  stale edits conflict, identical request retries replay the original result, and
  database uniqueness prevents two successors of one revision. Revision links,
  rather than transaction timestamps, determine each reduction's current amount.
  The aggregate is recalculated atomically from all effective reductions and
  cannot make payable less than valid allocated payments. Failure to append the
  correction rolls back the aggregate update. Closed/cancelled charges reject
  corrections; same-School/same-charge reference keys reinforce tenant integrity.
- Cancellation is explicit, reasoned and only for OPEN, fully unpaid charges
  whose due date is strictly after today in the School timezone. Today/overdue
  and allocated charges cannot be cancelled. Cancelled charges retain history;
  further adjustments are rejected. No implicit refund or payment reversal.
- A School-row transaction lock serializes Finance writes; live User/member
  locks and authorization rechecks guard the write boundary. Generation shares
  locks on year and selected enrollment/Student/Class rows. Database uniqueness
  independently prevents duplicate identities. No network call occurs under
  these locks and ambiguous writes are never automatically retried.
- All references enforce same-School composite foreign keys with RESTRICT
  history retention. New tables enable RLS and deny PUBLIC/API-role access;
  server services remain the application authorization boundary.

## HTTP and UI

`/finance` reuses the existing shell, controls, School context and cookie locale.
Configuration, preview/confirmation, paginated charge list/detail, reductions and
cancellation have EN/FR/AR labels and inherited RTL/LTR document presentation.
Options/search results are bounded (100 Student matches; bulk selection works
server-side). Charges page in groups of 50; previews in groups of 50 for review.

School-context endpoints under `/api/v1/finance`:

- GET root: scoped configuration/options and filtered, paginated charges.
- POST fee-types; PATCH fee-types/:id: configure/activate/deactivate named fees.
- POST structures; PATCH structures/:id: create or revision-checked edit.
- POST charges/preview; POST charges/generate: explicit selection and confirmation.
- GET charges/:id; POST charges/:id/adjustments: detail/history and reasoned changes.

Strict request schemas reject client School/actor/allocated values. Cookie-authenticated
writes require exact same-Origin. All success/error responses are private/no-store.
Database internals do not enter public errors. Clients reuse operation keys after
transport failures; no automatic mutation retry.

## Pass 2 — Offline payments, allocations and receipts

- Only current ACTIVE School Admin authority can record or reverse payments and
  read Admin receipts. The same School/User/member locks and server authorization
  apply. Platform-only authority and Teachers receive no Finance access; Parents
  have only the dedicated child-scoped read exception below, with no mutations.
- Record money already collected outside Madrasio: CASH, BANK_TRANSFER or CHEQUE.
  No gateway, online collection, cheque clearing or monetary refund is performed.
  Positive integer minor units in the School currency, School-local received date (1900 through today), method,
  optional bounded reference, recording actor and database timestamp are retained.
- Historical/archived Students and closed Academic Years can have existing debts
  settled; current enrollment is not required to pay an existing charge. Student,
  payment and all selected charges must belong to exactly the same School/Student.
- Suggest oldest outstanding OPEN charges first, ordered by due date then UUID.
  The Admin may override suggested amounts. Up to 500 charges per payment; options
  return the oldest 500 with an explicit has-more notice. Every allocation is
  positive, unique per charge/payment, within the locked remaining balance, and
  their exact sum must equal the received amount. Unallocated credit is not V1.
- Explicit confirmation and a UUID idempotency key are mandatory. Identical
  retries return the same original payment; changed payloads under the same key
  conflict. All selected charges lock in UUID order, with the School finance lock
  serializing payments, reductions, cancellations and reversals. No automatic
  retry occurs after an ambiguous transport/commit outcome.
- Payments and allocations expose append/read only; there is no update/delete
  endpoint. A reversal appends a separate immutable history record, requires
  reason plus explicit confirmation, records actor/time/reference, and restores
  only that payment's allocations. Same-key repeats are no-ops; a second distinct
  reversal is rejected. Original amounts, allocations and receipt reference stay.
  Later reductions remain in force. Reversal never performs a financial refund.
- Payment/allocations/balance updates and mandatory FinancePaymentRecorded audit
  share one transaction; reversal/restoration and FinancePaymentReversed audit
  likewise commit or roll back together. The strict audit producer requires
  finance.manage and records only resource/Student/operation/reversal UUIDs,
  method and integer amount. Names, reason, reference and receipt bodies are not
  audit metadata. Domain history retains the required reason privately.
- RLS and explicit deny-all API-role grants protect the three new tables. Composite
  payment/charge foreign keys include Student as well as School; unique receipt,
  operation and reversal keys and existing charge money checks remain independent
  database guards. Cross-row allocation totals and append-only application access
  follow existing service/audit conventions: no trigger/function framework or
  claim of an owner-proof immutable ledger is introduced.
- Every payment receives a stable R-UUID receipt reference unique within its
  School. School name/timezone, Student name and allocation fee/period/due-date
  snapshots are retained even after renaming/configuration changes. Receipt reads
  are authorized and private/no-store. Reversed receipts retain the original data
  and display reversal status/reference/reason/operator/time.
- /finance adds recording, editable allocation confirmation, history/detail and
  reversal. /finance/receipts/:id provides print/Save as PDF. The authenticated
  receipt download is self-contained, escaped UTF-8 HTML with no scripts/external
  assets and no-store/attachment headers. Downloaded personal data is under the
  user's custody. Existing EN/FR/AR cookie presentation, RTL and UTC formatting
  fallback remain; business dates use the School timezone.

Migration 0024_finance-offline-payments appends three private tables and the
same-Student charge key required by allocation FKs. Pending 0023 is preserved.
The generated key statement is ordered before dependent FKs. No hosted migration
or provider change is authorized by implementation or local test results.

## Pass 3 — Balances, collections and outstanding reports

- There is no mutable Student balance or second ledger. Current applicable charges
  are OPEN original amounts less recorded reductions; cancelled charges contribute
  zero. Current paid amounts are the existing allocation aggregates, maintained
  atomically by payment/reversal services. Outstanding is net charges less allocations.
  Student overview also sums actual non-reversed payments across all Academic Years
  and shows paginated year/fee/month/due-date breakdown, cancellation, paid/partial/
  unpaid and overdue indicators, and links to existing payment history/receipts.
- Outstanding/summary filters are Academic Year, charge-generation Class and Student.
  A transfer does not move an old charge to a new Class. Historical enrollment is
  not joined, so multiple enrollment records cannot multiply debt. Summary includes
  net charges, allocated amount, outstanding and distinct overdue Students. Fully
  paid Students with OPEN charges remain visible with zero outstanding.
- Aging uses today's School-local calendar DATE, not process timezone or elapsed
  milliseconds: due today/future, 1–30, 31–60 and 61+ days. Buckets sum exactly to
  outstanding. A due-today charge is not overdue. There is no historical receivables
  snapshot or user-supplied as-of date.
- Collections use inclusive received-on calendar dates, optionally Student. Gross
  includes all payments in the interval; reversed amount includes those currently
  reversed, including reversals made later; net and method breakdown exclude them.
  Reversal reference/time and original receipt remain traceable. This is the current
  corrected state of collections received in that interval, not reversal-date cash
  movement or historical receivables. Academic Year/Class filters do not apply to
  whole-payment collection totals because one payment may span charge contexts.
- Each report uses a read-only repeatable-read transaction for authorization, totals
  and page rows in a single database snapshot. Aggregates are PostgreSQL integer sums
  checked against JavaScript's safe-integer limit; excess fails explicitly. Display
  and CSV format integer centimes without rounding large totals through division.
  No allocation joins multiply payment sums. Ordering always has a stable UUID tie.
- GET reports/outstanding, reports/collections and students/:id/balance under the
  existing Finance API enforce current School Admin authorization and tenant scope.
  JSON, CSV and errors are private/no-store. Strict filters reject client authority
  and repeated report parameters. Pages contain 50 rows; Student search is bounded
  to 100 matches. Search narrows the choices, not the report until one is selected.
- CSV uses exactly the same report service/filter/snapshot semantics, all matching
  rows irrespective of page. Exports over 10,000 rows fail explicitly; they never
  silently truncate. UTF-8 BOM, CRLF, universal quoting/doubled quotes, and dangerous
  spreadsheet-formula prefixes are handled. Columns identify the School currency, reporting dates,
  timezone and active scope filters. Downloaded personal data must be stored safely.
- /finance integrates reports and balances with existing controls, EN/FR/AR and RTL;
  no charting library, new standard UI primitive or dependency is introduced.

## Tuition Management V1 — dedicated Parent read-only exception

The approved 2026-10-25 extension reorganizes `/finance` into six URL-backed
internal sections and adds a child-specific Parent tuition section. Existing
School Admin financial writes, locks, exact minor-unit arithmetic, currency
locking, immutable receipt snapshots, generation previews/idempotency and audit
atomicity retain the contracts above. No Teacher or Parent mutation authority,
database migration, dependency or online payment capability is added.

Parents do not receive `finance.read` or `finance.manage`. Dedicated GET routes
under `/api/v1/parent/children/:studentId/tuition` expose only the selected child's
all-academic-year balance, paginated charges/payment history and receipt reads.
`receipts/:paymentId` returns the Parent projection; `?download=1` returns its
escaped self-contained HTML attachment. Every request, including receipt detail
and download, verifies current session, ACTIVE School/membership, Parent role,
ACTIVE Parent profile and ACTIVE ParentStudent relationship server-side. Queries
constrain School, Student and payment identity, rejecting foreign or unrelated
resources. Authorization, totals and rows share a read-only repeatable-read
transaction. Strict query validation and private/no-store responses apply to
successes and errors.

Parent receipts preserve original payment and allocation snapshot names, dates,
amounts and currency, with reversal reference/time where applicable. They exclude
internal staff identity, reversal reasons/notes, request keys and audit metadata.
No historical payment or receipt is edited/deleted. Browser Print / Save as PDF
and HTML download are supported; there is no native PDF-generation endpoint.

The School Admin overview composes existing reports/history in a read-only
repeatable-read transaction: selected-year (or all-year) outstanding and overdue
totals remain distinct from School-local month-to-date collections across years,
net of current reversals. Class outstanding uses the charge-generation Class
snapshot ID, so later transfers do not regroup previous debt. Frontend routing,
presentation and bounded verification are documented in
`docs/frontend/tuition-management.md`.

## Pending migration release/recovery boundary

Pass 3 adds no schema or migration. Apply pending 0023 before 0024 through the
canonical journal; 0024's School/Student charge unique key precedes allocation FKs.
All eight Finance tables enable RLS and explicitly revoke PUBLIC/API role grants;
same-School/Student composite constraints and RESTRICT preserve financial history.
Fresh replay and populated 0022→0023→0024 upgrades are local test targets.

Do not use table drops or a blind journal rollback after recording financial data.
Separately authorized release work must verify the target's migration ledger,
backup/recovery procedure and application/schema compatibility before applying
either pending migration. Prefer a reviewed forward correction; any restore needs
its own data-loss/consistency assessment. Local testing is not hosted migration,
pooler, real-Auth browser acceptance or deployment approval. Invoices, expenses,
payroll, online collection and advanced accounting remain outside Finance V1.

## School currency forward migration

Migration 0025_school-finance-currency adds School and allocation currency defaults
(MAD), broadens the three former MAD-only checks, and adds currency-consistency
keys. It preserves existing financial amounts and all deployed migration bytes.
Apply 0025 before deploying code that selects the new columns; verify 26 journal
records and the unchanged 51 application tables. Recovery bundles require their
matching source/schema revision: 0022 and 0024 artifacts retain their original
format and cannot be restored through the 0025 migration chain.

Once non-MAD financial records exist, a rollback to the earlier MAD-only application
is unsafe even if the database migration is retained. Prefer a forward correction;
do not relabel stored amounts or remove currency constraints to enable a rollback.

## Individual reduction corrections

Forward migration `0026_finance-reduction-corrections` extends the existing charge
event table with nullable correction references/values, guarded self-references
and one-successor uniqueness. Existing events keep all original values; no data
conversion or new tables are introduced. Migration head becomes 0026 (27 records,
51 application tables). Apply it before the corresponding application release.
Historic migrations 0023–0025 and their snapshots must remain unchanged. Recovery
continues to use full rows and the exact matching source/migration chain.
