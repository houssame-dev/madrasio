# Academic Structure — Internal Domain Boundary

> **Not an independent V1 Product Module.**

The V1 product contains exactly **12 functional modules**:

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

Academic Structure is **not** a 13th product module. It is an **internal
shared domain boundary** that the relevant modules depend on for academic
context concepts.

## Why this folder exists

Several modules share a coherent set of academic context concepts:

- AcademicYear
- AcademicPeriod
- Stage
- Level
- Track (optional)
- Curriculum
- CurriculumVersion
- CurriculumSubject

Bundling these into a single internal boundary keeps each owning module from
duplicating the same concepts and ensures that versioned academic context is
modeled consistently across the system.

## Boundary ownership rules

- This folder does NOT have a dashboard, navigation entry, or CRUD surface.
- This folder does NOT appear in user-facing module lists.
- Concrete ownership of each concept will be decided when the relevant
  modules are implemented (for example, Curriculum versioning will be
  formalized alongside Classes and Grades).
- Other modules must consume Academic Structure concepts via explicit
  application contracts or domain operations — they must not mutate Academic
  Structure data directly.

## Status

Placeholder. No business behavior is implemented at this stage.