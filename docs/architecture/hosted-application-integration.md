# Hosted Application Integration

> Task 043 exercised the existing application against the approved Supabase
> STAGING project. It did not deploy, change schema, process background work,
> enable the Data API, or touch Production.

## Target and starting state

The positively verified target was project `cqeaxlttezunirsmkrxz` in
`eu-central-1`, with `TARGET_ENV=staging`, runtime Transaction Pooler port
`6543`, and operator Session Pooler port `5432`. Browser/server Supabase
configuration referenced the same project. Public signup and anonymous sign-in
were disabled. A normal `schools` Data API request could not query data. The
migration journal contained 14 entries and all 39 application tables were
present. No effective Production target was found.

The starting fixture contained one School, three application/Auth users and
memberships (SchoolAdmin, Teacher, Parent), one Teacher and assignment, one
Parent and active child relationship, two Students and enrollments, and no
workflow rows. Relationships and Auth/application UUID links were checked, not
inferred from counts. Students had no Auth identities.

## Authentication, context, and identity isolation

Real password login, `/api/v1/me`, protected shell loading, current-School
selection/cookie behavior, logout, and relogin passed for SchoolAdmin. The same
browser context then completed Admin → Teacher → Parent → Admin transitions.
Each identity resolved its own role and navigation; no prior role's data or
navigation persisted. The one-membership School selector remained constrained
to the authoritative current School.

Teacher `/me` resolved `TEACHER`, the self profile, and exactly the active
assignment. Parent `/me` resolved `PARENT`; navigation was limited to Dashboard,
My Children, and Notifications. Direct Parent access to Students, Teachers,
Parents, Grades, Attendance, and Announcement management APIs was denied.

## Academic and administrative workflows

SchoolAdmin reads rendered the seeded AcademicYear, two Periods, Stage, Level,
two Subjects, CurriculumVersion, CurriculumSubjects, and Class. A Subject code
was patched and restored through the canonical API to prove a non-destructive
write and cache refresh.

Student list, detail, and enrollment history loaded. One additional STAGING
Student was created through the API and enrolled in the existing exact
AcademicYear/Class. Detail and placement reloaded correctly. The Auth audit
remained exactly three expected identities, so all three Students remained
application-domain records only.

Teacher list/detail/assignment history and Parent list/detail/active child
relationship loaded correctly. The seeded identities and relationship were not
replaced or ended.

## Gradebook, assessments, and grades

SchoolAdmin created one `OPEN` Gradebook bound to the exact AcademicYear,
Period, Class, Mathematics Subject, and active GradingConfigurationVersion.
Attempting to patch historical context was rejected by validation. Two
Assessments (Quiz and Exam) were created, one edited while DRAFT, and both
published.

The Grade matrix derived a three-Student roster from enrollment. One atomic
bulk request persisted six Grade rows covering `VALID`, `MISSING`, `ABSENT`,
and `EXCUSED`; non-VALID scores remained null and decimal values reloaded
exactly. Teacher later updated one assigned Quiz value to `16.00`. The Teacher
could read and edit the assigned Gradebook but received `403` for an unassigned
French Gradebook and for Period/Annual management.

## Result calculation, reconciliation, and publication

The original canonical calculation reproduced the controlled
`CALCULATION_INCOMPLETE` / `UNCONFIGURED` outcome with zero Result/publication
side effects. Its Task 042 version used `WEIGHTED` Assessment aggregation
without `weightsByType` and unsupported V1 Annual `WEIGHTED_AVERAGE`.

Task 043.1 preserved those rules and the original Gradebook binding. The
STAGING-only operator recognized the exact legacy state, archived version 1,
and atomically created deterministic ACTIVE version 2 using `EQUAL` Assessment
weighting and simple Annual averaging. An immediate rerun was an exact no-op.
No historical JSON or Gradebook context was updated. The historical Gradebook
was moved normally from `OPEN` to `CLOSED`.

Two new successor-bound Gradebooks covered Mathematics in Period 2 and French
in Period 1. Each received one published Quiz and one exact `VALID` Grade for
the Parent-related child. The server produced two SubjectResults, two distinct
PeriodResults, and one AnnualResult averaging both Period results. The primary
SubjectResult was finalized, published, and revised once through `/revise`;
retrying the same revision idempotency key returned publication version 2
without duplication. Both PeriodResults and the AnnualResult were finalized
and published separately.

The Parent read model returned only latest publication-backed data: one Subject
publication at version 2, two Period publications, and one Annual publication.
It exposed no raw Grade, Assessment, Gradebook, configuration, publisher, or
idempotency data. Teacher saw the assigned Mathematics SubjectResult, saw no
French result, and remained denied Subject finalization plus Period/Annual
management.

## Attendance and homework

Attendance authorization, roster context, and date validation were exercised.
The seeded AcademicYear starts `2026-09-01`, while the integration run occurred
on `2026-08-31`; every in-year date was therefore future-dated. The canonical
API correctly rejected marking with `INVALID_ATTENDANCE_DATE`. No invalid date
or direct database workaround was used, so Attendance rows remained zero.

Teacher created and published one assignment-scoped Mathematics Homework with
one Class target. The three-Student roster loaded. One supported staff-side
submission was created and exercised through review, return, and resubmission;
its final state is `SUBMITTED`. No Student Auth/UI was invented and no Grade or
Result coupling occurred.

## Announcements, scheduling, notifications, and outbox

SchoolAdmin created and immediately published one version-1 Class/PARENTS
Announcement. Teacher scope rejected a SCHOOL target and allowed one
assignment-scoped Class/PARENTS publication. Each publication created its
recipient snapshot and one pending `AnnouncementPublished` OutboxEvent.

SchoolAdmin also created one future publication scheduled for
`2027-06-15T12:00:00.000Z`. It remains `SCHEDULED` with its version and target;
it has no premature snapshot or OutboxEvent. Task 043 did not execute it.

Notifications remained zero and the empty inbox rendered for every role. This
is the expected pre-processor state: Task 044 owns Outbox delivery and due
scheduled-publication processing.

## Hosted UI, query, cache, error, and accessibility findings

Real-data smoke passed at approximately 375px, 768px, and 1440px for the app
shell, Grade matrix, Attendance, Homework, Announcement detail, and Parent
results. No document-level horizontal overflow was observed. The mobile drawer
trapped focus, closed on Escape, restored trigger focus, and logout remained
keyboard accessible.

Representative request observation found no duplicate API calls: Grade matrix
9/9 unique, Announcements 3/3, Notifications 3/3, Teacher dashboard 7/7,
Parent dashboard 3/3, and Parent child detail 8/8. Mutated lists/details and the
Grade/Homework/Announcement states reloaded without whole-cache clearing.

One accessibility defect was fixed: embedded empty/error panels used a second
`h1`, producing two page-level headings in an empty Notifications page. Embedded
states now use `h2` while standalone denial/no-School states retain `h1`.
Malformed identifiers, authorization failures, calendar validation, and result
calculation errors remained controlled; no SQL, hostname, connection string,
secret, or stack trace appeared in the UI/API response.

## Final hosted state

| Resource | Count |
| --- | ---: |
| schools / users / memberships | 1 / 3 / 3 |
| students / enrollments | 3 / 3 |
| teachers / assignments | 1 / 1 |
| parents / relationships | 1 / 1 |
| grading configurations / versions | 1 / 2 |
| gradebooks / assessments / grades | 3 / 4 / 8 |
| subject / period / annual results | 2 / 2 / 1 |
| result publications | 5 |
| attendance records | 0 |
| homework / submissions | 1 / 1 |
| announcements / versions / targets | 3 / 3 / 3 |
| announcement publications / recipient snapshots | 3 / 2 |
| notifications | 0 |
| outbox events | 7 |

All seven OutboxEvents are `PENDING`: two `AnnouncementPublished`, four
`ResultPublished`, and one `ResultRevisionPublished`. Every Result event has
one frozen eligible recipient. One of the three AnnouncementPublications is
the unchanged future scheduled publication; the other two are published. No
integration data was wiped.

## Defects and Task 044 handoff

Fixed in source:

- future deterministic seed grading rules now match supported V1 calculation
  semantics and exact rules participate in partial-state detection;
- embedded state panels preserve a single page-level heading;
- a credential-conditional Playwright suite now verifies real Admin, Teacher,
  and Parent login/context plus representative allowed/denied APIs. Normal test
  runs skip it without hosted credentials.

Task 044 now has real pending work from both domains: two Announcement events,
five Result publication/revision events, and one future scheduled publication.
Notifications remain zero, confirming no processor ran prematurely. The
grading HIGH finding is resolved with historical evidence intact; Task 043 is
ready for Task 044.

No migration, schema change, RLS policy, Data API change, Production change, or
credential-bearing tracked file was created.
