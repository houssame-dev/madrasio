# Business Rules
## School Management System — V1

This document defines the approved business rules for V1.

It is the authoritative reference for:

- Domain behavior
- Validation rules
- State transitions
- Authorization implications
- Historical behavior
- Cross-module business behavior

This document must be read together with:

- `CLAUDE.md`
- `README.md`
- `docs/domain/domain-model.md`
- `docs/architecture/overview.md`

---

# 1. Business Rule Philosophy

The system must preserve:

- Academic correctness
- Historical integrity
- School isolation
- Explicit authorization
- Predictable lifecycle transitions
- Deterministic calculations
- Clear ownership

Business rules must be enforced by the server.

Critical invariants should also be protected at the database level when practical.

---

# 2. V1 Functional Modules

V1 contains the following 12 functional modules:

1. Authentication
2. Schools
3. Students
4. Teachers
5. Subjects
6. Classes
7. Grades
8. Attendance
9. Homework
10. Parents
11. Announcements
12. Notifications

Academic Structure is a shared domain boundary used by the relevant modules.

It contains concepts such as:

- AcademicYear
- AcademicPeriod
- Stage
- Level
- Track
- Curriculum
- CurriculumVersion
- CurriculumSubject

---

# 3. Global Rules

### BR-GLOBAL-001 — School is the Primary Tenant

Every school-scoped business operation belongs to exactly one School Context.

A request operating on School A must never access School B data.

### BR-GLOBAL-002 — Server Authorization Is Mandatory

Frontend checks are UX only.

Every protected business operation must be authorized server-side.

### BR-GLOBAL-003 — Current State Must Not Rewrite History

Changes to current records must not silently rewrite historical academic meaning.

Examples include:

- Student transfers
- Teacher assignment changes
- Curriculum changes
- Grading configuration changes
- Announcement revisions

### BR-GLOBAL-004 — Modules Own Their Business Data

A module must not directly mutate another module's owned business records.

Cross-module changes must use:

- Explicit application operations
- Approved contracts
- Domain events

### BR-GLOBAL-005 — Business Actions Must Be Explicit

Complex business operations must not be represented as arbitrary field updates when doing so hides the business meaning.

Examples:

- Transfer Student
- Publish Result
- Publish Announcement
- Archive Student
- Close Academic Period

### BR-GLOBAL-006 — Current Context Must Be Server-Resolved

The application must validate:

- Current User
- School Membership
- Current School Context

before allowing school-scoped operations.

A client-provided `schoolId` is never sufficient proof of access.

### BR-GLOBAL-007 — Historical Records Are First-Class

Historical entities must remain queryable and understandable after current-state changes.

Historical data includes:

- Enrollment
- Assignments
- Results
- Curriculum versions
- Grading configuration versions
- Announcement versions
- Publication recipient snapshots

---

# 4. Authentication Rules

### BR-AUTH-001 — User Identity Is Separate from Domain Profiles

A User is an authenticated identity.

A Teacher, Parent, or Student is a domain concept.

### BR-AUTH-002 — Student Does Not Need a User Account in V1

Students exist as academic entities.

Student authentication is outside V1.

### BR-AUTH-003 — Authentication Is Separate from Authorization

Supabase Auth handles authentication.

The application determines:

- Role
- Permission
- School scope
- Academic scope
- Ownership
- Relationship

### BR-AUTH-004 — Inactive Users Cannot Perform Protected Operations

A suspended or disabled account must not perform protected operations.

Historical data remains intact.

### BR-AUTH-005 — Membership Must Be Active

Even if authentication succeeds, a User cannot operate within a School if their SchoolMembership is no longer active.

---

# 5. School Rules

### BR-SCHOOL-001 — School Is the Tenant Boundary

School-scoped entities must never cross tenant boundaries.

### BR-SCHOOL-002 — User and School Are Many-to-Many Capable

A User may belong to more than one School through SchoolMembership.

The User entity itself must not be treated as belonging to one immutable School.

### BR-SCHOOL-003 — Current School Context Controls the Session Scope

When a User operates within School A, queries and mutations must be scoped to School A.

### BR-SCHOOL-004 — School Switching Requires Membership

A User may switch to another School only when an active SchoolMembership exists for that School.

### BR-SCHOOL-005 — Cached School Data Must Not Leak Across Contexts

When switching School Context:

- school-scoped client queries must be invalidated/refreshed
- data from the previous School must not be shown as current School data

---

# 6. Role Rules

### BR-ROLE-001 — V1 Roles

V1 supports:

- SUPER_ADMIN
- SCHOOL_ADMIN
- TEACHER
- PARENT

There is no Student role in V1.

### BR-ROLE-002 — Role Alone Is Not Enough

A role does not automatically grant unrestricted access.

Permission and scope must also be evaluated.

### BR-ROLE-003 — School Admin Scope

School Admin operates within the active School Context.

A School Admin cannot manage another School simply because the other School exists.

### BR-ROLE-004 — Teacher Scope

Teacher scope comes exclusively from TeacherAssignment.

### BR-ROLE-005 — Parent Scope

Parent scope comes from ParentStudent plus the relevant Student/academic context.

---

# 7. Academic Structure Rules

### BR-ACADEMIC-001 — Academic Year Is a Time Boundary

Academic entities must be associated with an AcademicYear where the business concept requires it.

### BR-ACADEMIC-002 — Academic Period Belongs to an Academic Year

An AcademicPeriod cannot belong to multiple AcademicYears.

### BR-ACADEMIC-003 — Stage/Level/Track Form the School's Academic Structure

The exact combination depends on the School's configuration.

Track is optional when not applicable.

### BR-ACADEMIC-004 — Classes Are Academic-Year Specific

A Class is contextualized to an AcademicYear.

A new AcademicYear must not silently reuse the previous year's Class as current academic membership.

### BR-ACADEMIC-005 — Curriculum Is Versioned

When academic configuration changes in a way that affects historical interpretation, a new CurriculumVersion must be created.

### BR-ACADEMIC-006 — Historical Curriculum Versions Remain Stable

A CurriculumVersion already used by historical academic records must not be semantically rewritten.

### BR-ACADEMIC-007 — Academic Calendar Boundaries Preserve History

AcademicYear and AcademicPeriod date corrections are permitted only while the
affected calendar entity is PLANNED and has no date-sensitive operational
history. Every AcademicPeriod must remain within its AcademicYear after any
calendar write. ACTIVE, CLOSED, and ARCHIVED calendar boundaries are historical
and must not move.

Calendar correction must never rewrite Classes, Enrollments, Assignments,
Attendance, Gradebooks, Assessments, Homework, Grades, or Results. Concurrent
Year and Period writes must serialize their containment decision on the owning
School-scoped AcademicYear.

---

# 8. Subject Rules

### BR-SUBJECT-001 — Subject Represents Subject Identity

Subject stores the generic identity/basic information of a subject.

### BR-SUBJECT-002 — Subject Does Not Own a Universal Coefficient

Coefficient is contextual.

It belongs to CurriculumSubject.

### BR-SUBJECT-003 — Same Subject May Have Different Coefficients

Example:

```text
Mathematics
Track A → coefficient 7
Track B → coefficient 5
```

Both are valid because the coefficient belongs to the academic curriculum context.

### BR-SUBJECT-004 — CurriculumSubject Connects Subject to Academic Context

The coefficient and other curriculum-specific properties are defined at CurriculumSubject level.

### BR-SUBJECT-005 — Historical Coefficients Must Remain Stable

Changing a current coefficient must not rewrite historical calculations that used an earlier configuration.

---

# 9. Student Rules

### BR-STUDENT-001 — Student Belongs to One School Context

A Student record belongs to one School.

### BR-STUDENT-002 — Student Is Not Defined by Current Class

Student identity must not depend on a mutable current `class_id`.

### BR-STUDENT-003 — StudentEnrollment Is the Source of Truth

Class placement and academic enrollment history are represented through StudentEnrollment.

### BR-STUDENT-004 — Enrollment Belongs to an Academic Context

An enrollment should identify the relevant:

- School
- AcademicYear
- Class
- Enrollment lifecycle

### BR-STUDENT-005 — Active Enrollment Overlap Is Forbidden

A Student must not have conflicting overlapping active enrollments within the same academic context when the domain does not explicitly permit it.

### BR-STUDENT-006 — Student Transfer Is a Business Operation

A transfer should:

- End the previous enrollment
- Create the new enrollment
- Preserve historical enrollment
- Validate the target Class and academic context
- Emit a relevant domain event when required

It must not simply overwrite historical class information.

### BR-STUDENT-007 — Historical Enrollment Is Immutable in Meaning

Ending an enrollment should not rewrite what Class the Student was previously enrolled in.

### BR-STUDENT-008 — Student Archive Does Not Delete Academic History

Archiving a Student must not delete:

- Grades
- Results
- Attendance
- Enrollment history
- Historical relationships

---

# 10. Teacher Rules

### BR-TEACHER-001 — Teacher Is School-Scoped

A Teacher profile is associated with a School context.

### BR-TEACHER-002 — TeacherAssignment Defines Scope

TeacherAssignment determines the Classes and Subjects a Teacher is authorized to operate on.

### BR-TEACHER-003 — TeacherAssignment Must Be Valid in Its Academic Context

An Assignment must reference valid academic entities within the same School Context.

### BR-TEACHER-004 — Duplicate Logical Assignments Are Forbidden

The same Teacher must not receive the same logical Assignment twice within the same academic context.

### BR-TEACHER-005 — Ending an Assignment Removes Future Scope

When an Assignment ends:

- future access based on that Assignment stops
- historical records remain valid

### BR-TEACHER-006 — Historical Teacher Scope Is Preserved

Changing assignments must not rewrite historical grading or attendance records.

---

# 11. Parent Rules

### BR-PARENT-001 — Parent Is School-Scoped

A Parent profile belongs to a School context.

### BR-PARENT-002 — ParentStudent Defines Child Relationship

Parent access to a Student requires a valid ParentStudent relationship.

### BR-PARENT-003 — Parent Access Must Be Server-Verified

A client-provided Student ID never proves that the Student belongs to the Parent.

### BR-PARENT-004 — Ending Relationship Removes Current Access

If the ParentStudent relationship ends:

- current access must stop
- historical records must remain intact

### BR-PARENT-005 — Same-School Membership Does Not Grant Child Access

A Parent cannot access another Student simply because:

- both are in the same School
- both are in the same Class
- the Parent knows the Student ID

---

# 12. Class Rules

### BR-CLASS-001 — Class Belongs to a School

Class is school-scoped.

### BR-CLASS-002 — Class Belongs to an Academic Year

Historical Class context must remain identifiable.

### BR-CLASS-003 — Class Code/Identity Must Be Unique Within Its Academic Context

The same logical Class identifier must not be duplicated where the business key requires uniqueness.

### BR-CLASS-004 — Class Must Reference Valid Academic Context

A Class must reference compatible:

- AcademicYear
- CurriculumVersion
- Level
- Track where applicable

### BR-CLASS-005 — Closing/Archiving Class Does Not Delete History

Historical student enrollment, grades, attendance, and assignments remain valid.

---

# 13. Grade Rules

Grades are one of the highest-risk domains in the system.

### BR-GRADE-001 — Gradebook Has a Defined Academic Context

A Gradebook is associated with:

- School
- AcademicYear
- AcademicPeriod
- Class
- Subject
- GradingConfigurationVersion

### BR-GRADE-002 — Gradebook Context Must Be Unique

The same logical Class + Subject + AcademicPeriod context must not have conflicting active Gradebooks.

### BR-GRADE-003 — Assessment Belongs to One Gradebook

An Assessment belongs to exactly one Gradebook.

### BR-GRADE-004 — Grade Belongs to One Assessment and Student

For V1, one logical Grade exists per Student per Assessment.

Multiple attempts require an explicit future domain decision.

### BR-GRADE-005 — Score Must Respect Assessment Limits

A valid score must not exceed the Assessment's maximum score.

A score below the minimum allowed range must also be rejected.

### BR-GRADE-006 — Grade Status Is Distinct from Score

Business states such as:

- MISSING
- ABSENT
- EXCUSED

must not be represented by arbitrary NULL semantics alone.

### BR-GRADE-007 — Teacher Must Have Assignment Scope

A Teacher can enter/update Grades only when their TeacherAssignment authorizes the relevant:

- Class
- Subject
- Academic context

### BR-GRADE-008 — Gradebook State Controls Editing

A closed/locked Gradebook cannot be modified by normal Teacher editing operations.

### BR-GRADE-009 — Period Result Is Not Annual Result

PeriodResult and AnnualResult are different business concepts.

A PeriodResult must never silently become the AnnualResult.

### BR-GRADE-010 — Published Results Are Historically Protected

Once an official result is published, later changes must follow the approved revision process.

Do not silently overwrite the published historical result.

### BR-GRADE-011 — Results Use Correct Configuration Versions

Historical results must use the grading configuration/version applicable to them.

### BR-GRADE-012 — Coefficients Are Contextual

Grade calculations use the correct CurriculumSubject coefficient for the relevant academic context/version.

### BR-GRADE-013 — Changing Current Configuration Does Not Rewrite History

If:

```text
Old coefficient = 7
New coefficient = 5
```

historical results calculated using the old configuration remain based on the old configuration.

### BR-GRADE-014 — Revision Must Be Explicit

A revision is a deliberate business operation.

It is not equivalent to editing a published result without trace.

### BR-GRADE-015 — Official Grade Ownership Belongs to Grades

Attendance or Homework must not independently overwrite Official Grades.

---

# 14. Attendance Rules

### BR-ATTENDANCE-001 — Attendance Is Separate from Grades

Attendance is an independent domain.

### BR-ATTENDANCE-002 — Attendance Record Belongs to a Student and Class Context

For the V1 daily model, the logical context is:

```text
Student
+
Class
+
Attendance Date
```

### BR-ATTENDANCE-003 — One Logical Daily Attendance Record

A Student must not have duplicate daily attendance records for the same Class context unless the domain explicitly introduces session-level attendance.

### BR-ATTENDANCE-004 — Teacher Scope Is Required

Teacher attendance operations must respect TeacherAssignment scope.

### BR-ATTENDANCE-005 — Corrections Are Explicit

Correcting Attendance is a distinct business operation and should be traceable where required.

### BR-ATTENDANCE-006 — Attendance Alerts Are Rule-Based

An attendance event does not automatically generate a notification unless the approved business rule says it should.

---

# 15. Homework Rules

### BR-HOMEWORK-001 — Homework Is Independent from Grades

Homework is not automatically a Grade.

### BR-HOMEWORK-002 — Homework Has an Academic Context

Homework should identify relevant:

- Teacher
- Class/Target
- Subject
- Academic period/context

### BR-HOMEWORK-003 — Homework Targeting Is Explicit

A Homework assignment must have a valid target.

### BR-HOMEWORK-004 — Publish Is an Explicit Action

Draft Homework is not equivalent to published Homework.

### BR-HOMEWORK-005 — Submission Belongs to the Correct Student/Assignment Context

A Student cannot submit Homework for another Student.

### BR-HOMEWORK-006 — Review Is Teacher-Scoped

Only an authorized Teacher may review/manage a Submission.

### BR-HOMEWORK-007 — Homework-to-Grade Integration Is Explicit

If Homework contributes to Grades, the relationship must be created explicitly.

Creating Homework alone must never create an Assessment or Grade.

---

# 16. Announcement Rules

### BR-ANNOUNCEMENT-001 — Draft and Published State Are Different

An Announcement may exist as a Draft before publication.

Draft content may be edited according to permissions.

### BR-ANNOUNCEMENT-002 — Published Versions Are Historical Snapshots

Once a version is published, its historical content must remain reconstructable.

### BR-ANNOUNCEMENT-003 — Rich Text Must Be Sanitized

All user-provided Rich Text must be safely sanitized before trusted rendering.

### BR-ANNOUNCEMENT-004 — Multiple Audiences Are Supported

An Announcement can target multiple supported audiences simultaneously.

### BR-ANNOUNCEMENT-005 — Target Combinations Must Be Validated

Not every arbitrary combination of audiences and targets is valid.

The system must validate the combination before publication.

### BR-ANNOUNCEMENT-006 — Publishing Requires Authorization

A User must have both:

- permission to publish
- appropriate School/academic scope

### BR-ANNOUNCEMENT-007 — Teacher Direct Publishing Is Allowed

Teachers with the appropriate permission may publish announcements directly.

V1 does not require a mandatory approval workflow.

### BR-ANNOUNCEMENT-008 — Attachments Must Be Valid

Attachments must:

- belong to the correct AnnouncementVersion
- use allowed file types
- satisfy size constraints
- be in READY state when publication requires READY attachments

### BR-ANNOUNCEMENT-009 — Publication Creates Historical Recipient Snapshot

At publication time:

```text
Resolve Recipients
      ↓
Deduplicate
      ↓
Create Snapshot
```

The snapshot must remain historically stable.

### BR-ANNOUNCEMENT-010 — Recipient Changes After Publication Do Not Rewrite History

If a Student:

- changes Class
- leaves School
- gains/loses a Parent relationship

the historical PublicationRecipientSnapshot does not change.

### BR-ANNOUNCEMENT-011 — Scheduling Is a Future Publication State

A Scheduled Announcement must not become visible as Published before its scheduled time.

### BR-ANNOUNCEMENT-012 — Scheduled Work Must Be Due-Based

Correctness must not depend on a timer firing at exactly the scheduled second.

If processing is delayed, the system should process the now-due Announcement safely.

### BR-ANNOUNCEMENT-013 — Concurrent Publication Must Be Safe

Two workers/requests attempting to publish the same scheduled Announcement must not create duplicate Publications.

### BR-ANNOUNCEMENT-014 — Revisions Are Explicit

Creating a new revision does not rewrite the previous published version.

### BR-ANNOUNCEMENT-015 — Archive Does Not Destroy Publication History

Archiving an Announcement must not delete historical versions or recipient snapshots.

---

# 17. Notification Rules

### BR-NOTIFICATION-001 — Notification Belongs to One Recipient

Every Notification has a logical recipient User.

### BR-NOTIFICATION-002 — Notification Is School-Scoped Where the Source Is School-Scoped

A School-specific Notification must remain associated with the correct School Context.

### BR-NOTIFICATION-003 — Notification Is Persisted Before Realtime Delivery

The database record must exist before any optional realtime delivery attempt.

### BR-NOTIFICATION-004 — Realtime Is Not the Source of Truth

If realtime delivery fails:

> Notification remains available

### BR-NOTIFICATION-005 — Notification Processing Is Idempotent

The same logical Event must not create duplicate Notifications for the same recipient.

### BR-NOTIFICATION-006 — Read Is an Idempotent Operation

Marking an already-read Notification as read must not create an error or duplicate operation.

### BR-NOTIFICATION-007 — Read All Is User/School Scoped

Mark All as Read must affect only Notifications belonging to the current authorized User and School Context.

### BR-NOTIFICATION-008 — Notification Source Access Must Remain Authorized

A Notification referencing a source resource must not allow the User to bypass authorization for that source resource.

---

# 18. File Rules

### BR-FILE-001 — Binary Files Live Outside PostgreSQL

PostgreSQL stores metadata and relationships.

Cloudflare R2 stores actual binary content.

### BR-FILE-002 — Files Are Private by Default

No private school file should become publicly accessible by default.

### BR-FILE-003 — Authorization Happens Before File Access

A signed/download capability must not be created until:

- User is authenticated
- School Context is valid
- Source resource is authorized
- Attachment access is authorized

### BR-FILE-004 — File Type Must Be Validated

Do not trust the file extension alone.

Validate:

- MIME type
- Extension
- Size
- Allowed category

### BR-FILE-005 — Executable Files Are Not Allowed

V1 must reject dangerous executable file types that are not required by the product.

**Examples include:**

- `.exe`
- `.dll`
- `.bat`
- `.cmd`
- `.sh`
- `.apk`

The exact denylist may be expanded.

### BR-FILE-006 — Storage Key Must Not Use User Filename

Original filenames are presentation metadata.

Storage keys should use generated opaque identifiers.

### BR-FILE-007 — Processing State Matters

Only READY files should be treated as usable/publishable when the business workflow requires a validated file.

### BR-FILE-008 — Attachment Removal Does Not Necessarily Mean Immediate Physical Deletion

Physical file cleanup may happen asynchronously after domain references are safely removed.

---

# 19. Authorization Rules

### BR-AUTHZ-001 — Permission Is Required

Sensitive operations require the appropriate Permission.

### BR-AUTHZ-002 — Scope Is Also Required

Permission without valid scope does not grant access.

### BR-AUTHZ-003 — Teacher Scope Is Assignment-Based

Teacher operations require matching TeacherAssignment.

### BR-AUTHZ-004 — Parent Scope Is Relationship-Based

Parent operations require valid ParentStudent relationship and applicable student context.

### BR-AUTHZ-005 — Ownership Matters

Operations on "own" resources must verify the current User is the owner.

### BR-AUTHZ-006 — Resource State Can Deny an Otherwise Authorized Operation

**Example:**

```text
Teacher
+
grades.update
+
correct assignment
+
Gradebook CLOSED
=
DENY
```

### BR-AUTHZ-007 — List Queries Must Be Scope-Aware

Do not:

```text
load all data
→ filter in frontend
```

Scope must be applied during server-side querying.

### BR-AUTHZ-008 — Bulk Operations Must Check Every Target

Having permission for a bulk operation does not authorize resources outside the user's scope.

### BR-AUTHZ-009 — Cross-Tenant Access Is Denied

Knowing a valid UUID does not grant access.

---

# 20. Historical Rules

### BR-HISTORY-001 — Enrollment History Is Preserved

Old enrollment records remain traceable after transfer.

### BR-HISTORY-002 — Teacher Assignment History Is Preserved

Old assignments remain traceable after changes/end dates.

### BR-HISTORY-003 — Curriculum History Is Preserved

Old CurriculumVersions remain available where historical records depend on them.

### BR-HISTORY-004 — Grading Configuration History Is Preserved

Old versions remain associated with historical calculations.

### BR-HISTORY-005 — Published Result History Is Preserved

Published results cannot be silently rewritten.

### BR-HISTORY-006 — Announcement Publication History Is Preserved

Historical versions and recipient snapshots remain stable.

---

# 21. Event Rules

### BR-EVENT-001 — Domain Events Represent Business Meaning

Events should represent meaningful state changes.

### BR-EVENT-002 — Critical Events Use Outbox

Important cross-module events must be persisted reliably within the source transaction.

### BR-EVENT-003 — Consumers Must Expect Duplicate Delivery

Consumers must be idempotent.

### BR-EVENT-004 — Event Failure Must Not Corrupt Source Domain State

If notification processing fails, the already-published Announcement remains published.

### BR-EVENT-005 — Realtime Failure Must Not Affect Domain Correctness

A realtime delivery failure must not roll back a successful business operation.

---

# 22. Data Integrity Rules

### BR-INTEGRITY-001 — Foreign Key Relationships Must Be Valid

Core relationships must not reference non-existent entities.

### BR-INTEGRITY-002 — School-Owned Relationships Must Respect Tenant

Entities from different Schools must not be linked where the domain requires same-School relationships.

### BR-INTEGRITY-003 — Unique Business Keys Must Be Database-Protected

Important duplicate-prevention rules should use Database constraints whenever practical.

### BR-INTEGRITY-004 — Application Validation Is Not the Only Protection

Important invariants should be protected at multiple layers when possible:

> Application + Database

---

# 23. Concurrency Rules

### BR-CONCURRENCY-001 — Critical State Changes Must Be Race-Safe

**Examples:**

- Publish Announcement
- Publish Result
- Close Gradebook
- Process Scheduled Announcement

### BR-CONCURRENCY-002 — Duplicate Publication Must Be Prevented

Two concurrent requests must not result in two logical Publications for the same version.

### BR-CONCURRENCY-003 — Stale Updates Must Be Detectable Where Required

Where concurrent editing can cause data loss, optimistic concurrency should be considered.

---

# 24. State Transition Rules

Lifecycle state changes must be explicit.

**Generic pattern:**

```text
VALID CURRENT STATE
       ↓
REQUESTED ACTION
       ↓
BUSINESS VALIDATION
       ↓
NEW STATE
```

Invalid transitions must be rejected.

---

# 25. Example Invalid State Transitions

**Examples:**

```text
Published Announcement
→ Directly mutate old published content
```

Invalid.

```text
Closed Gradebook
→ Normal Teacher Grade Update
```

Invalid.

```text
Ended Enrollment
→ Silently treat as active
```

Invalid.

```text
Archived Class
→ New current enrollment without reopening/approved lifecycle
```

Invalid.

Exact lifecycle rules are owned by their respective modules.

---

# 26. Business Rule Change Policy

Business rules must not be changed casually in implementation.

Before introducing a new business rule:

1. Identify the affected Domain.
2. Determine whether an existing rule already covers it.
3. Evaluate historical implications.
4. Evaluate authorization implications.
5. Evaluate database implications.
6. Update this document.
7. Update relevant domain/architecture documentation.
8. Add or update tests.
9. Record an ADR when the change is architectural.

---

# 27. V1 Deliberate Non-Goals

The following are intentionally not part of V1 unless explicitly approved:

- Student authentication
- Student portal
- Chat/messaging system
- Email notification infrastructure
- SMS notification infrastructure
- Push notification infrastructure
- Payment processing
- Microservices
- Kafka
- RabbitMQ
- Kubernetes
- Dedicated backend service
- Automatic Homework-to-Grade conversion
- Advanced analytics platform
- Complex search engine

---

# 28. Critical Domain Areas

The following domains are considered highest risk:

1. Authorization
2. Multi-Tenant Isolation
3. StudentEnrollment
4. TeacherAssignment
5. Grades
6. Historical Results
7. Announcement Targeting
8. Recipient Snapshots
9. Notification Idempotency
10. File Authorization

Any changes to these areas require extra review and tests.

---

# 29. Business Rule Testing Requirement

Every critical business rule must have automated test coverage.

**Examples:**

- Teacher scope
- Parent scope
- Enrollment overlap
- Coefficient context
- Historical grade calculation
- Announcement targeting
- Recipient deduplication
- Notification idempotency
- Cross-school access

---

# 30. Final Business Rule Principle

The system must always be able to answer correctly:

- Who is this user?
- Which school are they operating in?
- What role do they have?
- What are they allowed to do?
- Which academic scope applies?
- Which student/class/subject does it concern?
- What was true historically?
- What is true now?
- What should happen next?

The implementation must preserve these answers consistently across:

- UI
- API
- Domain
- Database
- Events
- Background processing
