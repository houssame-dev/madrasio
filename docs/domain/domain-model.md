# Domain Model
## School Management System — V1

This document defines the approved domain model for V1 of the School Management System.

It describes:

- Core entities
- Relationships
- Ownership
- Academic context
- Lifecycle concepts
- Historical requirements
- Domain boundaries

It does **NOT** define:

- Database implementation details
- API implementation details
- UI implementation details
- ORM implementation details

Those concerns are documented separately.

---

# 1. Domain Philosophy

The system models a school as an academic organization operating across time.

The most important concepts are:

```text
School
Academic Context
People
Relationships
Assignments
Enrollment
Curriculum
Results
Communication
```

The domain must preserve historical truth.

Current state and historical state must not be confused.

---

# 2. Primary Tenant

The primary tenant is:

> School

A School owns or contextualizes the majority of academic and operational data.

**Examples:**

- Students
- Teachers
- Parents
- Classes
- Subjects
- Academic Structure
- Grades
- Attendance
- Homework
- Announcements
- Notifications

Some entities are platform-level rather than school-owned, such as the global identity represented by a User.

---

# 3. Identity Model

### 3.1 User

User represents an authenticated system identity.

Its application-owned `email` is the unique canonical lookup projection of
the Supabase Auth email: surrounding whitespace is trimmed and letters are
lowercased. Supabase Auth still owns authentication, credentials, and the
source identity. The projection is not a credential and is not authorization
authority. An Auth/application email mismatch must fail closed pending a
controlled reconciliation.

A User may participate in one or more Schools.

User identity is separate from academic/business profiles.

A User does not automatically become a Student, Teacher, or Parent merely because the account exists.

### 3.2 SchoolMembership

SchoolMembership connects a User to a School.

Conceptually:

```text
User
  │
  └── SchoolMembership ── School
```

SchoolMembership determines that the user is allowed to operate within the School context, subject to membership status and authorization.

A user may potentially have memberships in multiple schools.

---

# 4. Roles

V1 supports the following primary roles:

- SUPER_ADMIN
- SCHOOL_ADMIN
- TEACHER
- PARENT

There is intentionally no Student role in V1.

Role does **NOT** completely determine access.

Role is combined with:

- Permission
- School Membership
- Academic Scope
- Ownership
- Relationships
- Resource State

---

# 5. School

School represents a school tenant.

Important conceptual attributes include:

- Identity
- Name
- Status
- Timezone
- Configuration

School is the main tenant boundary for school-scoped operations.

---

# 6. Academic Context

Academic context represents the period and structure in which school activity takes place.

Important concepts include:

- AcademicYear
- AcademicPeriod
- Stage
- Level
- Track
- Curriculum
- CurriculumVersion
- CurriculumSubject
- Class

---

# 7. AcademicYear

AcademicYear represents a school academic year.

**Examples:**

- 2025/2026
- 2026/2027
- 2027/2028

An AcademicYear provides a temporal context for:

- Classes
- Enrollments
- Teacher assignments
- Curriculum usage
- Gradebooks
- Results
- Attendance
- Homework

---

# 8. AcademicPeriod

AcademicPeriod represents a period within an AcademicYear.

**Examples may include:**

- Term 1
- Term 2
- Term 3
- Semester 1
- Semester 2

The exact period structure is configurable according to school requirements.

**Important:**

An AcademicPeriod is not an AnnualResult.

---

# 9. Stage

Stage represents an educational stage.

**Examples:**

- Primary
- Middle School
- Secondary School

---

# 10. Level

Level represents an educational level within a Stage.

**Examples:**

- 1st Year
- 2nd Year
- 3rd Year
- 1BAC
- 2BAC

The exact naming depends on the school's academic structure.

---

# 11. Track

Track represents an academic specialization or pathway where applicable.

**Examples:**

- Sciences Mathématiques
- Sciences Physiques
- Sciences Économiques

A Track may not exist for every Level or Stage.

Track is therefore optional where the academic model does not require it.

---

# 12. Curriculum

Curriculum represents an academic curriculum definition.

Curriculum provides the conceptual container for:

- Subjects
- Academic structure
- Coefficients
- Curriculum versions

---

# 13. CurriculumVersion

CurriculumVersion represents a specific version of a Curriculum applicable to a particular academic context.

Conceptually:

```text
Curriculum
    ↓
CurriculumVersion
```

A new curriculum configuration should create a new version when historical preservation is required.

A version used by historical academic records must remain semantically stable.

---

# 14. Subject

Subject represents the identity/basic definition of a school subject.

**Examples:**

- Mathematics
- Physics
- Arabic
- French
- English
- History

Subject represents the subject itself.

Subject does **NOT** own the academic coefficient.

---

# 15. CurriculumSubject

CurriculumSubject represents the relationship between a Subject and a specific CurriculumVersion.

Conceptually:

```text
CurriculumVersion
        +
      Subject
        +
   Curriculum Context
        ↓
CurriculumSubject
```

This is where contextual academic information such as coefficient belongs.

---

# 16. Subject Coefficient

A coefficient is contextual.

For example:

> Mathematics

may have:

> Coefficient = 7

in one curriculum/track and:

> Coefficient = 5

in another.

Therefore:

**Coefficient belongs to CurriculumSubject, not Subject.**

This decision is mandatory for V1.

---

# 17. Class

Class represents a concrete academic class/group operating within a School and AcademicYear.

A Class is contextualized by:

- School
- AcademicYear
- CurriculumVersion
- Level
- Track where applicable

A Class has its own lifecycle.

---

# 18. Class Lifecycle

Classes are academic-year-specific.

A new academic year should create a new class context rather than mutating the previous year's historical class.

Historical Classes remain available for:

- Historical results
- Historical attendance
- Historical enrollment
- Historical reporting

---

# 19. Student

Student represents the academic identity of a student within a School.

Student is **NOT** equivalent to a User.

A Student can exist without having an authentication account in V1.

---

# 20. StudentStatus

A Student may have a lifecycle/status such as:

- ACTIVE
- INACTIVE
- WITHDRAWN
- ARCHIVED

Exact statuses are controlled by the approved Students domain rules.

Status must represent meaningful business state.

---

# 21. StudentEnrollment

StudentEnrollment is one of the most important historical entities.

It represents the student's enrollment in an academic context.

Conceptually:

```text
Student
   ↓
StudentEnrollment
   ├── School
   ├── AcademicYear
   └── Class
```

StudentEnrollment is the source of truth for:

- Class membership history
- Academic placement
- Transfers
- Enrollment lifecycle

---

# 22. Student Transfer

A Student transfer is a Business Operation.

**Example:**

```text
Student
   ↓
Enrollment A
   ↓
Class A
```

Then:

```text
Transfer
   ↓
End Enrollment A
   ↓
Create Enrollment B
   ↓
Class B
```

The old enrollment must remain historically traceable.

A transfer must **NOT** simply overwrite a Student's current `class_id`.

---

# 23. Teacher

Teacher represents the academic profile of a teacher within a School.

Teacher may be associated with an authenticated User.

Teacher is separate from User identity.

---

# 24. TeacherAssignment

TeacherAssignment is the source of truth for Teacher academic scope.

It determines the relationship between:

- Teacher
- Class
- Subject
- Academic Context

Conceptually:

```text
Teacher
   ↓
TeacherAssignment
   ├── Class
   ├── Subject
   └── AcademicYear / academic context
```

No parallel teacher-scope model should be introduced.

---

# 25. TeacherAssignment Lifecycle

Assignments can:

- Start
- Remain active
- Change
- End

Historical assignments must remain traceable.

Changing a TeacherAssignment affects future access but must not rewrite historical academic records.

---

# 26. Parent

Parent represents the parent/guardian academic relationship within a School.

Parent may be associated with an authenticated User.

Parent is separate from User identity.

---

# 27. ParentStudent

ParentStudent represents the relationship between a Parent and a Student.

Conceptually:

```text
Parent
  ↓
ParentStudent
  ↓
Student
```

This relationship is the primary foundation for Parent child access.

---

# 28. Parent Access

Parent access must satisfy:

> ParentStudent relationship + Current School Context + Relevant Student Enrollment + Resource publication/access rules

A Parent may not access another student's information merely because:

- the student is in the same school
- the student is in the same class
- the student shares a Teacher
- the Parent knows the Student ID

---

# 29. Grade Domain

The Grades domain is responsible for academic evaluation.

**Primary concepts:**

- Gradebook
- Assessment
- Grade
- SubjectResult
- PeriodResult
- AnnualResult
- GradingConfiguration
- GradingConfigurationVersion

---

# 30. Gradebook

Gradebook represents the grading context for:

- School
- AcademicYear
- AcademicPeriod
- Class
- Subject
- GradingConfigurationVersion

A Gradebook should be uniquely identifiable within its academic context.

---

# 31. Assessment

Assessment represents an academic evaluation within a Gradebook.

**Examples:**

- Quiz
- Exam
- Homework Assessment
- Class Test
- Oral Assessment

An Assessment may define:

- Title
- Type
- Maximum score
- Weight
- Status

The final available assessment types are controlled by the Grades domain.

---

# 32. Grade

Grade represents a student's result for a specific Assessment.

Conceptually:

```text
Assessment
    +
Student
    ↓
Grade
```

For V1, one logical Grade exists per Student per Assessment unless future requirements explicitly introduce multiple attempts.

---

# 33. Grade State

Grade data should distinguish between meaningful states.

**Examples include:**

- VALID
- MISSING
- ABSENT
- EXCUSED

A NULL score must not be used as a replacement for all business states.

---

# 34. SubjectResult

SubjectResult represents a student's calculated result for a Subject within the appropriate academic period/context.

It may depend on:

- Assessments
- Grades
- Grading configuration
- Subject coefficient
- Curriculum context

---

# 35. PeriodResult

PeriodResult represents a result for a specific AcademicPeriod.

It is distinct from an AnnualResult.

---

# 36. AnnualResult

AnnualResult represents the student's annual academic result.

It is **NOT** simply an alias for the latest PeriodResult.

Annual calculations must follow the approved school grading configuration.

---

# 37. GradingConfiguration

GradingConfiguration defines how academic results are calculated.

It may describe concepts such as:

- Assessment weighting
- Subject weighting
- Period calculation
- Annual calculation
- Rounding rules
- Passing thresholds
- Required assessments

The exact formula is configurable according to the school's chosen grading model.

---

# 38. GradingConfigurationVersion

When grading rules change in a way that affects historical interpretation:

```text
GradingConfiguration
        ↓
GradingConfigurationVersion
```

is used.

A configuration version used by historical/published results must remain semantically immutable.

---

# 39. Attendance Domain

Attendance is an independent academic domain.

**Primary concept:**

- AttendanceRecord

---

# 40. AttendanceRecord

An AttendanceRecord represents a student's attendance state in a defined academic attendance context.

The V1 daily model is conceptually:

```text
Student
+
Class
+
Attendance Date
→
AttendanceRecord
```

The record may contain a status such as:

- PRESENT
- ABSENT
- LATE
- EXCUSED

The final exact status vocabulary is defined by Attendance business rules.

---

# 41. Homework Domain

**Primary concepts:**

- Homework
- HomeworkTarget
- HomeworkSubmission

---

# 42. Homework

Homework represents an academic assignment created by an authorized Teacher.

It is associated with an academic context such as:

- Class
- Subject
- Academic Period
- Teacher

---

# 43. HomeworkTarget

HomeworkTarget identifies who the Homework is intended for.

Depending on the approved targeting model, this may refer to:

- Class
- Student group
- Specific students

The target model must remain explicit.

---

# 44. HomeworkSubmission

HomeworkSubmission represents a Student's submission for Homework.

It may contain:

- Submission state
- Submitted timestamp
- Attachments
- Teacher review information

---

# 45. Homework and Grades

Homework does not automatically create Grades.

If Homework contributes to grading:

```text
Homework
    ↓
Explicit grading relationship
    ↓
Assessment / Grade domain
```

Any integration must be intentional and traceable.

---

# 46. Announcement Domain

**Primary concepts:**

- Announcement
- AnnouncementAudience
- AnnouncementTarget
- AnnouncementVersion
- AnnouncementPublication
- PublicationRecipientSnapshot
- AnnouncementAttachment

---

# 47. Announcement

Announcement represents the logical communication object.

It may exist as:

- DRAFT
- PUBLISHED
- SCHEDULED
- ARCHIVED

The exact lifecycle depends on approved business rules.

---

# 48. AnnouncementAudience

AnnouncementAudience identifies the broad audience type.

**Examples:**

- PARENTS
- TEACHERS
- STUDENTS
- SCHOOL

The final supported audience vocabulary is defined by the Announcements domain.

Multiple audiences are supported.

---

# 49. AnnouncementTarget

AnnouncementTarget identifies the specific target within an audience.

**Examples:**

- School
- Class
- Academic level
- Track
- Other approved target types

Target combinations must obey domain validation rules.

---

# 50. Multiple Audiences

An Announcement may target multiple audiences when valid.

**For example:**

> Parents + Teachers + Specific Class

The system must resolve the resulting recipients deterministically.

Duplicate recipients must be removed.

---

# 51. AnnouncementVersion

AnnouncementVersion represents a specific content snapshot of an Announcement.

A version includes the full publishable state required to understand what was published.

Future revisions must not rewrite historical versions.

---

# 52. AnnouncementPublication

AnnouncementPublication represents the publication of a specific AnnouncementVersion.

Conceptually:

```text
Announcement
    ↓
AnnouncementVersion
    ↓
AnnouncementPublication
```

A publication may include:

- Published by
- Published at
- Publication state
- Scheduling information
- Historical target/recipient state

---

# 53. PublicationRecipientSnapshot

PublicationRecipientSnapshot preserves who was targeted at publication time.

This is essential for historical correctness.

**Example:**

```text
Announcement published
        ↓
Recipients resolved
        ↓
Snapshot stored
```

If a student later changes class, the historical publication recipient list must not silently change.

---

# 54. AnnouncementAttachment

An AnnouncementAttachment connects an AnnouncementVersion to a stored File.

The actual binary file is stored outside PostgreSQL.

The domain stores the relationship and metadata necessary for the attachment.

---

# 55. Notification Domain

**Primary concept:**

- Notification

---

# 56. Notification

Notification represents an in-app message belonging to a specific recipient in a specific School context.

It may reference a source resource such as:

- Announcement
- Result
- Homework
- Attendance event

Notification state includes read/unread semantics.

---

# 57. Notification Read State

A Notification uses a read timestamp/state.

Conceptually:

```text
read_at = NULL
```

means unread.

A non-null `read_at` means read.

The exact storage representation may be adapted at implementation level.

---

# 58. Notification Idempotency

The same logical event must not create duplicate Notifications for the same recipient.

Notification generation must therefore use a stable idempotency strategy.

---

# 59. File Domain

**Primary concept:**

- File

Files represent stored binary resources.

The actual binary content is stored in Cloudflare R2.

PostgreSQL stores metadata and domain relationships.

---

# 60. File Metadata

Conceptually:

```text
File
├── Identity
├── Storage Key
├── Original Name
├── MIME Type
├── Size
├── Checksum
├── Processing Status
└── Timestamps
```

---

# 61. File Lifecycle

A File may pass through states such as:

- UPLOADING
- PROCESSING
- READY
- REJECTED

A file that is not READY must not be treated as safely publishable where the business workflow requires ready attachments.

---

# 62. AuditEvent

AuditEvent is a cross-cutting accountability record.

It is used for important business actions such as:

- Publishing results
- Changing curriculum configuration
- Archiving students
- Publishing announcements
- Managing enrollment

Audit is not intended to record every GET request.

---

# 63. OutboxEvent

OutboxEvent is an infrastructure entity used to guarantee reliable event processing.

It records an event as part of the same transaction that changes the relevant domain state.

Its lifecycle may include:

- PENDING
- PROCESSING
- PROCESSED
- FAILED

The exact operational state model may be expanded later.

---

# 64. Core Relationship Overview

A simplified relationship graph:

```text
                         School
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
   Memberships        Academic Year      Subjects
                           │                 │
                           ▼                 │
                    Academic Period          │
                           │                 │
                           ▼                 │
                       Curriculum            │
                           │                 │
                           ▼                 ▼
                  CurriculumVersion ── CurriculumSubject
                           │
                           ▼
                         Class
                      ┌────┴────┐
                      │         │
                      ▼         ▼
               Enrollment   TeacherAssignment
                      │         │
                      ▼         ▼
                   Student    Teacher
                      │
                      ▼
                  ParentStudent
                      │
                      ▼
                    Parent
```

---

# 65. Academic Flow

The primary academic flow is:

```text
School
   ↓
AcademicYear
   ↓
AcademicPeriod
   ↓
CurriculumVersion
   ↓
Class
   ↓
StudentEnrollment
   ↓
Student
```

Teacher scope enters through:

```text
Teacher
   ↓
TeacherAssignment
   ↓
Class + Subject
```

---

# 66. Grades Flow

```text
CurriculumSubject
      ↓
GradingConfiguration
      ↓
Gradebook
      ↓
Assessment
      ↓
Grade
      ↓
SubjectResult
      ↓
PeriodResult
      ↓
AnnualResult
```

Published results may generate:

```text
ResultPublished
      ↓
Notification
```

---

# 67. Communication Flow

```text
Announcement
      ↓
AnnouncementVersion
      ↓
Audience + Targets
      ↓
Publication
      ↓
Recipient Snapshot
      ↓
AnnouncementPublished Event
      ↓
Notifications
```

---

# 68. Historical Integrity Rules

The following must remain historically reliable:

- StudentEnrollment
- TeacherAssignment
- CurriculumVersion
- CurriculumSubject configuration
- GradingConfigurationVersion
- Published Results
- AnnouncementVersion
- PublicationRecipientSnapshot
- AuditEvent

Current changes must not silently rewrite historical meaning.

---

# 69. Domain Invariants

Important invariants include:

**Student**

A student belongs to one School context.

**Enrollment**

A student must not have overlapping active enrollments where the domain forbids overlap.

**TeacherAssignment**

A Teacher must not have duplicate assignments for the same logical context.

**CurriculumSubject**

A Subject coefficient belongs to a specific curriculum context.

**Grade**

A Grade must belong to a valid Assessment and Student context.

**Result**

Results must respect the relevant grading configuration/version.

**Announcement**

A published version must have a valid publishable state.

**Notification**

The same logical event must not produce duplicate logical notifications for the same recipient.

---

# 70. Domain vs Authentication Identity

These concepts must remain separate:

- User
- Teacher
- Parent
- Student

A User is an authenticated identity.

A Teacher or Parent is a domain profile/relationship.

A Student does not require a User account in V1.

---

# 71. Domain vs Database

The Domain Model is the source of business meaning.

The Database is an implementation mechanism.

Do not modify domain semantics just to make a database query easier.

If a database optimization is required, keep the domain meaning intact.

---

# 72. Domain vs API

API resources represent application interactions.

They do not need to mirror every domain entity one-to-one.

**For example:**

```text
POST /students/:id/transfer
```

represents a business operation involving StudentEnrollment.

It is not simply a raw update to a Student record.

---

# 73. Domain Change Policy

A new entity, relationship, lifecycle state, or business rule must not be added casually.

Before adding a domain concept, verify:

- What business problem does it represent?
- Which module owns it?
- What existing entity cannot represent it safely?
- Does it affect historical data?
- Does it affect authorization?
- Does it affect database constraints?
- Does it affect API or UI?
- Does it require an ADR?

---

# 74. V1 Scope Protection

The following are intentionally outside V1 unless explicitly approved:

- Student login/account
- Microservices
- Full messaging/chat system
- Email/SMS notification infrastructure
- Payment processing
- Advanced analytics platform
- Complex search engine
- Distributed event broker
- Kubernetes
- Dedicated mobile backend
- Automatic Homework-to-Grade creation

---

# 75. Final Domain Principle

The system should model:

- Who belongs to which School?
- Who is related to which Student?
- Who teaches which Subject to which Class?
- Which Curriculum applies?
- Which configuration applies?
- Which results were calculated?
- What was published?
- Who received what?

The Domain Model must preserve these answers historically and securely.
