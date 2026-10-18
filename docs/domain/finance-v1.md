# Finance V1 — Student Fees and Offline Payments

Authoritative Pass 1–3 contract (FINANCE_V1_IMPLEMENT_01/02/03). Applies alongside ADR-007
(School tenant boundary), ADR-008 (enrollment placement/history), ADR-004 (Drizzle)
and ADR-023 (platform authority confers no School membership). This is student
receivables, not SaaS subscriptions or a general ledger.

- Only ACTIVE School Admin members can read/manage Finance. Verified server
  identity and an ACTIVE School are required for every operation. No Accountant
  role, public grant, parent/teacher access or platform-only School bypass.
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
- Money is MAD integer centimes, never floating-point arithmetic. Amounts are
  positive and at most 999,999,999 centimes. Totals remain safe integers within
  bounded batches. UI decimal input is converted using decimal-text arithmetic.
- Generated charges snapshot fee name, structure revision, Class/year, period,
  due date and original amount. Structure edits affect later generation only.
  No generated-charge deletion or mutation of original amount/date/context API.
- A manual reduction is an additional positive amount, requires a reason, and
  cannot reduce the payable amount below existing allocations. Original amount
  remains immutable. Every adjustment appends actor, time, reason, previous/new
  amount and idempotency identity in the same transaction as the charge change.
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
  read receipts. The same School/User/member locks and server authorization
  apply. Platform-only authority, Teachers and Parents receive no Finance access.
- Record money already collected outside Madrasio: CASH, BANK_TRANSFER or CHEQUE.
  No gateway, online collection, cheque clearing or monetary refund is performed.
  Positive MAD centimes, School-local received date (1900 through today), method,
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
  spreadsheet-formula prefixes are handled. Columns identify MAD, reporting dates,
  timezone and active scope filters. Downloaded personal data must be stored safely.
- /finance integrates reports and balances with existing controls, EN/FR/AR and RTL;
  no charting library, new standard UI primitive or dependency is introduced.

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
