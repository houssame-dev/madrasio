import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../drizzle/schema';
import { createTestDb, type Db } from './helpers';

let db: Db;

async function createSchool(name: string) {
  const [school] = await db.insert(schema.schools).values({ name }).returning();
  return school;
}

async function createAcademicYear(
  schoolId: string,
  name: string,
  startDate = '2025-09-01',
  endDate = '2026-07-01',
) {
  const [row] = await db
    .insert(schema.academicYears)
    .values({ schoolId, name, startDate, endDate })
    .returning();
  return row;
}

async function createStage(schoolId: string, name: string, sequence = 1) {
  const [row] = await db.insert(schema.stages).values({ schoolId, name, sequence }).returning();
  return row;
}

async function createLevel(schoolId: string, stageId: string, name: string, sequence = 1) {
  const [row] = await db
    .insert(schema.levels)
    .values({ schoolId, stageId, name, sequence })
    .returning();
  return row;
}

async function createTrack(schoolId: string, name: string, sequence = 1) {
  const [row] = await db.insert(schema.tracks).values({ schoolId, name, sequence }).returning();
  return row;
}

async function createCurriculum(schoolId: string, name: string) {
  const [row] = await db.insert(schema.curricula).values({ schoolId, name }).returning();
  return row;
}

async function createCurriculumVersion(schoolId: string, curriculumId: string, name: string) {
  const [row] = await db
    .insert(schema.curriculumVersions)
    .values({ schoolId, curriculumId, name })
    .returning();
  return row;
}

async function createSubject(schoolId: string, name: string, code?: string) {
  const [row] = await db.insert(schema.subjects).values({ schoolId, name, code }).returning();
  return row;
}

async function createCurriculumSubject(
  schoolId: string,
  curriculumVersionId: string,
  subjectId: string,
  coefficient: string,
) {
  const [row] = await db
    .insert(schema.curriculumSubjects)
    .values({ schoolId, curriculumVersionId, subjectId, coefficient })
    .returning();
  return row;
}

async function createClass(
  schoolId: string,
  academicYearId: string,
  levelId: string,
  curriculumVersionId: string,
  name: string,
  trackId?: string,
) {
  const [row] = await db
    .insert(schema.classes)
    .values({ schoolId, academicYearId, levelId, curriculumVersionId, name, trackId })
    .returning();
  return row;
}

beforeEach(async () => {
  ({ db } = await createTestDb());
});

describe('academic_years', () => {
  it('belongs to a School', async () => {
    const school = await createSchool('School A');

    const year = await createAcademicYear(school.id, '2025/2026');

    expect(year.schoolId).toBe(school.id);
    expect(year.status).toBe('PLANNED');
  });

  it('rejects a duplicate logical year within the same School', async () => {
    const school = await createSchool('School A');
    await createAcademicYear(school.id, '2025/2026');

    await expect(createAcademicYear(school.id, '2025/2026')).rejects.toThrow();
  });

  it('rejects an invalid date range', async () => {
    const school = await createSchool('School A');

    await expect(
      db.insert(schema.academicYears).values({
        schoolId: school.id,
        name: 'Bad Year',
        startDate: '2026-07-01',
        endDate: '2025-09-01',
      }),
    ).rejects.toThrow();
  });

  it('allows two different Schools to use the same year label', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');

    const yearA = await createAcademicYear(schoolA.id, '2025/2026');
    const yearB = await createAcademicYear(schoolB.id, '2025/2026');

    expect(yearA.schoolId).toBe(schoolA.id);
    expect(yearB.schoolId).toBe(schoolB.id);
  });
});

describe('academic_periods', () => {
  it('belongs to an AcademicYear', async () => {
    const school = await createSchool('School A');
    const year = await createAcademicYear(school.id, '2025/2026');

    const [period] = await db
      .insert(schema.academicPeriods)
      .values({
        schoolId: school.id,
        academicYearId: year.id,
        name: 'Term 1',
        sequence: 1,
        startDate: '2025-09-15',
        endDate: '2025-12-20',
      })
      .returning();

    expect(period.academicYearId).toBe(year.id);
    expect(period.status).toBe('PLANNED');
  });

  it('rejects a cross-school AcademicYear relation', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const yearA = await createAcademicYear(schoolA.id, '2025/2026');

    await expect(
      db.insert(schema.academicPeriods).values({
        schoolId: schoolB.id,
        academicYearId: yearA.id,
        name: 'Term 1',
        sequence: 1,
        startDate: '2025-09-15',
        endDate: '2025-12-20',
      }),
    ).rejects.toThrow();
  });

  it('rejects an invalid date range', async () => {
    const school = await createSchool('School A');
    const year = await createAcademicYear(school.id, '2025/2026');

    await expect(
      db.insert(schema.academicPeriods).values({
        schoolId: school.id,
        academicYearId: year.id,
        name: 'Bad Period',
        sequence: 1,
        startDate: '2025-12-20',
        endDate: '2025-09-15',
      }),
    ).rejects.toThrow();
  });

  it('preserves deterministic ordering within an AcademicYear', async () => {
    const school = await createSchool('School A');
    const year = await createAcademicYear(school.id, '2025/2026');

    await db.insert(schema.academicPeriods).values({
      schoolId: school.id,
      academicYearId: year.id,
      name: 'Term 2',
      sequence: 2,
      startDate: '2026-01-05',
      endDate: '2026-03-27',
    });
    await db.insert(schema.academicPeriods).values({
      schoolId: school.id,
      academicYearId: year.id,
      name: 'Term 1',
      sequence: 1,
      startDate: '2025-09-15',
      endDate: '2025-12-20',
    });

    const periods = await db
      .select()
      .from(schema.academicPeriods)
      .where(eq(schema.academicPeriods.academicYearId, year.id))
      .orderBy(asc(schema.academicPeriods.sequence));

    expect(periods.map((p) => p.sequence)).toEqual([1, 2]);
  });

  it('rejects a duplicate period ordering within the same AcademicYear', async () => {
    const school = await createSchool('School A');
    const year = await createAcademicYear(school.id, '2025/2026');

    await db.insert(schema.academicPeriods).values({
      schoolId: school.id,
      academicYearId: year.id,
      name: 'Term 1',
      sequence: 1,
      startDate: '2025-09-15',
      endDate: '2025-12-20',
    });

    await expect(
      db.insert(schema.academicPeriods).values({
        schoolId: school.id,
        academicYearId: year.id,
        name: 'Term 2',
        sequence: 1,
        startDate: '2026-01-05',
        endDate: '2026-03-27',
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate period identity within the same AcademicYear', async () => {
    const school = await createSchool('School A');
    const year = await createAcademicYear(school.id, '2025/2026');

    await db.insert(schema.academicPeriods).values({
      schoolId: school.id,
      academicYearId: year.id,
      name: 'Term 1',
      sequence: 1,
      startDate: '2025-09-15',
      endDate: '2025-12-20',
    });

    await expect(
      db.insert(schema.academicPeriods).values({
        schoolId: school.id,
        academicYearId: year.id,
        name: 'Term 1',
        sequence: 2,
        startDate: '2026-01-05',
        endDate: '2026-03-27',
      }),
    ).rejects.toThrow();
  });
});

describe('stages', () => {
  it('is school-scoped', async () => {
    const school = await createSchool('School A');

    const stage = await createStage(school.id, 'Primary');

    expect(stage.schoolId).toBe(school.id);
    expect(stage.status).toBe('ACTIVE');
  });

  it('rejects a duplicate identity within the same School', async () => {
    const school = await createSchool('School A');
    await createStage(school.id, 'Primary');

    await expect(createStage(school.id, 'Primary')).rejects.toThrow();
  });

  it('allows the same stage name in different Schools', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');

    const a = await createStage(schoolA.id, 'Primary');
    const b = await createStage(schoolB.id, 'Primary');

    expect(a.schoolId).toBe(schoolA.id);
    expect(b.schoolId).toBe(schoolB.id);
  });
});

describe('levels', () => {
  it('belongs to a Stage', async () => {
    const school = await createSchool('School A');
    const stage = await createStage(school.id, 'Secondary');

    const level = await createLevel(school.id, stage.id, '1BAC');

    expect(level.stageId).toBe(stage.id);
    expect(level.status).toBe('ACTIVE');
  });

  it('rejects a cross-school Stage relation', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const stageA = await createStage(schoolA.id, 'Primary');

    await expect(createLevel(schoolB.id, stageA.id, '1st Year')).rejects.toThrow();
  });

  it('rejects a duplicate level identity within the same Stage', async () => {
    const school = await createSchool('School A');
    const stage = await createStage(school.id, 'Primary');
    await createLevel(school.id, stage.id, '1st Year');

    await expect(createLevel(school.id, stage.id, '1st Year')).rejects.toThrow();
  });
});

describe('tracks', () => {
  it('is school-scoped and optional', async () => {
    const school = await createSchool('School A');

    const track = await createTrack(school.id, 'Sciences Mathématiques');

    expect(track.schoolId).toBe(school.id);
    expect(track.status).toBe('ACTIVE');
  });

  it('rejects a duplicate identity within the same School', async () => {
    const school = await createSchool('School A');
    await createTrack(school.id, 'Economics');

    await expect(createTrack(school.id, 'Economics')).rejects.toThrow();
  });

  it('allows the same track name in different Schools', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');

    const a = await createTrack(schoolA.id, 'Mathematics');
    const b = await createTrack(schoolB.id, 'Mathematics');

    expect(a.schoolId).toBe(schoolA.id);
    expect(b.schoolId).toBe(schoolB.id);
  });
});

describe('curricula', () => {
  it('is school-scoped', async () => {
    const school = await createSchool('School A');

    const curriculum = await createCurriculum(school.id, 'National Curriculum');

    expect(curriculum.schoolId).toBe(school.id);
    expect(curriculum.status).toBe('ACTIVE');
  });

  it('rejects a duplicate identity within the same School', async () => {
    const school = await createSchool('School A');
    await createCurriculum(school.id, 'National Curriculum');

    await expect(createCurriculum(school.id, 'National Curriculum')).rejects.toThrow();
  });
});

describe('curriculum_versions', () => {
  it('belongs to a Curriculum', async () => {
    const school = await createSchool('School A');
    const curriculum = await createCurriculum(school.id, 'National Curriculum');

    const version = await createCurriculumVersion(school.id, curriculum.id, '2025-2026');

    expect(version.curriculumId).toBe(curriculum.id);
    expect(version.status).toBe('DRAFT');
  });

  it('rejects a cross-school Curriculum relation', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const curriculumA = await createCurriculum(schoolA.id, 'National Curriculum');

    await expect(createCurriculumVersion(schoolB.id, curriculumA.id, '2025-2026')).rejects.toThrow();
  });

  it('rejects a duplicate version identity within the same Curriculum', async () => {
    const school = await createSchool('School A');
    const curriculum = await createCurriculum(school.id, 'National Curriculum');
    await createCurriculumVersion(school.id, curriculum.id, '2025-2026');

    await expect(createCurriculumVersion(school.id, curriculum.id, '2025-2026')).rejects.toThrow();
  });

  it('historical/lifecycle model works — archiving a used version does not break history', async () => {
    const school = await createSchool('School A');
    const curriculum = await createCurriculum(school.id, 'National Curriculum');
    const version = await createCurriculumVersion(school.id, curriculum.id, '2025-2026');

    const [activated] = await db
      .update(schema.curriculumVersions)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.curriculumVersions.id, version.id))
      .returning();
    expect(activated.status).toBe('ACTIVE');

    const stage = await createStage(school.id, 'Primary');
    const level = await createLevel(school.id, stage.id, '1st Year');
    const year = await createAcademicYear(school.id, '2025/2026');
    const klass = await createClass(school.id, year.id, level.id, version.id, 'Class A');

    const [archived] = await db
      .update(schema.curriculumVersions)
      .set({ status: 'ARCHIVED' })
      .where(eq(schema.curriculumVersions.id, version.id))
      .returning();
    expect(archived.status).toBe('ARCHIVED');

    const historicalClasses = await db
      .select()
      .from(schema.classes)
      .where(eq(schema.classes.curriculumVersionId, version.id));
    expect(historicalClasses.map((c) => c.id)).toContain(klass.id);
  });
});

describe('subjects', () => {
  it('is school-scoped', async () => {
    const school = await createSchool('School A');

    const subject = await createSubject(school.id, 'Mathematics');

    expect(subject.schoolId).toBe(school.id);
    expect(subject.status).toBe('ACTIVE');
  });

  it('rejects a duplicate identity within the same School', async () => {
    const school = await createSchool('School A');
    await createSubject(school.id, 'Mathematics');

    await expect(createSubject(school.id, 'Mathematics')).rejects.toThrow();
  });

  it('does not own the academic coefficient', async () => {
    expect(schema.subjects).not.toHaveProperty('coefficient');
  });
});

describe('curriculum_subjects', () => {
  it('references a CurriculumVersion and a Subject', async () => {
    const school = await createSchool('School A');
    const curriculum = await createCurriculum(school.id, 'National Curriculum');
    const version = await createCurriculumVersion(school.id, curriculum.id, '2025-2026');
    const subject = await createSubject(school.id, 'Mathematics');

    const cs = await createCurriculumSubject(school.id, version.id, subject.id, '7');

    expect(cs.curriculumVersionId).toBe(version.id);
    expect(cs.subjectId).toBe(subject.id);
    expect(cs.status).toBe('ACTIVE');
  });

  it('stores the coefficient here (not on Subject)', async () => {
    const school = await createSchool('School A');
    const curriculum = await createCurriculum(school.id, 'National Curriculum');
    const versionA = await createCurriculumVersion(school.id, curriculum.id, 'A');
    const versionB = await createCurriculumVersion(school.id, curriculum.id, 'B');
    const subject = await createSubject(school.id, 'Mathematics');

    const csA = await createCurriculumSubject(school.id, versionA.id, subject.id, '7');
    const csB = await createCurriculumSubject(school.id, versionB.id, subject.id, '5');

    expect(Number(csA.coefficient)).toBe(7);
    expect(Number(csB.coefficient)).toBe(5);
  });

  it('supports decimal coefficients', async () => {
    const school = await createSchool('School A');
    const curriculum = await createCurriculum(school.id, 'National Curriculum');
    const version = await createCurriculumVersion(school.id, curriculum.id, '2025-2026');
    const subject = await createSubject(school.id, 'Physics');

    const cs = await createCurriculumSubject(school.id, version.id, subject.id, '5.25');

    expect(Number(cs.coefficient)).toBe(5.25);
  });

  it('rejects a duplicate (CurriculumVersion, Subject) relationship', async () => {
    const school = await createSchool('School A');
    const curriculum = await createCurriculum(school.id, 'National Curriculum');
    const version = await createCurriculumVersion(school.id, curriculum.id, '2025-2026');
    const subject = await createSubject(school.id, 'Mathematics');
    await createCurriculumSubject(school.id, version.id, subject.id, '7');

    await expect(createCurriculumSubject(school.id, version.id, subject.id, '7')).rejects.toThrow();
  });

  it('rejects a cross-school CurriculumVersion + Subject relationship', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const curriculumA = await createCurriculum(schoolA.id, 'National Curriculum');
    const versionA = await createCurriculumVersion(schoolA.id, curriculumA.id, '2025-2026');
    const subjectA = await createSubject(schoolA.id, 'Mathematics');
    const subjectB = await createSubject(schoolB.id, 'Physics');

    await expect(
      createCurriculumSubject(schoolA.id, versionA.id, subjectB.id, '7'),
    ).rejects.toThrow();
    await expect(
      createCurriculumSubject(schoolB.id, versionA.id, subjectA.id, '7'),
    ).rejects.toThrow();
  });
});

describe('classes', () => {
  async function academicContext(schoolId: string, versionName = '2025-2026') {
    const year = await createAcademicYear(schoolId, '2025/2026');
    const curriculum = await createCurriculum(schoolId, 'National Curriculum');
    const version = await createCurriculumVersion(schoolId, curriculum.id, versionName);
    const stage = await createStage(schoolId, 'Primary');
    const level = await createLevel(schoolId, stage.id, '1st Year');
    return { year, version, level };
  }

  it('belongs to a School + AcademicYear and references a Level + CurriculumVersion', async () => {
    const school = await createSchool('School A');
    const { year, version, level } = await academicContext(school.id);

    const klass = await createClass(school.id, year.id, level.id, version.id, 'Class A');

    expect(klass.schoolId).toBe(school.id);
    expect(klass.academicYearId).toBe(year.id);
    expect(klass.levelId).toBe(level.id);
    expect(klass.curriculumVersionId).toBe(version.id);
    expect(klass.status).toBe('ACTIVE');
  });

  it('supports an optional Track', async () => {
    const school = await createSchool('School A');
    const { year, version, level } = await academicContext(school.id);
    const track = await createTrack(school.id, 'Sciences Mathématiques');

    const withTrack = await createClass(school.id, year.id, level.id, version.id, 'Class A', track.id);
    const withoutTrack = await createClass(school.id, year.id, level.id, version.id, 'Class B');

    expect(withTrack.trackId).toBe(track.id);
    expect(withoutTrack.trackId).toBeNull();
  });

  it('rejects a cross-school AcademicYear', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year, version, level } = await academicContext(schoolA.id);

    await expect(createClass(schoolB.id, year.id, level.id, version.id, 'Class A')).rejects.toThrow();
  });

  it('rejects a cross-school Level', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year, version } = await academicContext(schoolA.id);
    const { level: levelB } = await academicContext(schoolB.id, '2025-2026');

    await expect(createClass(schoolA.id, year.id, levelB.id, version.id, 'Class A')).rejects.toThrow();
  });

  it('rejects a cross-school Track', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year, version, level } = await academicContext(schoolA.id);
    const trackB = await createTrack(schoolB.id, 'Economics');

    await expect(createClass(schoolA.id, year.id, level.id, version.id, 'Class A', trackB.id)).rejects.toThrow();
  });

  it('rejects a cross-school CurriculumVersion', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year, version, level } = await academicContext(schoolA.id);
    const { version: versionB } = await academicContext(schoolB.id, '2025-2026');

    await expect(createClass(schoolA.id, year.id, level.id, versionB.id, 'Class A')).rejects.toThrow();
  });

  it('rejects a duplicate class identity within the same School + AcademicYear', async () => {
    const school = await createSchool('School A');
    const { year, version, level } = await academicContext(school.id);
    await createClass(school.id, year.id, level.id, version.id, 'Class A');

    await expect(createClass(school.id, year.id, level.id, version.id, 'Class A')).rejects.toThrow();
  });

  it('allows the same class identity in different AcademicYears', async () => {
    const school = await createSchool('School A');
    const year1 = await createAcademicYear(school.id, '2025/2026', '2025-09-01', '2026-07-01');
    const year2 = await createAcademicYear(school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const curriculum = await createCurriculum(school.id, 'National Curriculum');
    const version1 = await createCurriculumVersion(school.id, curriculum.id, '2025-2026');
    const version2 = await createCurriculumVersion(school.id, curriculum.id, '2026-2027');
    const stage = await createStage(school.id, 'Primary');
    const level = await createLevel(school.id, stage.id, '1st Year');

    const c1 = await createClass(school.id, year1.id, level.id, version1.id, 'Class A');
    const c2 = await createClass(school.id, year2.id, level.id, version2.id, 'Class A');

    expect(c1.academicYearId).toBe(year1.id);
    expect(c2.academicYearId).toBe(year2.id);
  });
});