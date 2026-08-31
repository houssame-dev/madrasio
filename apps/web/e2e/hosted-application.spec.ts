import { expect, test, type Page } from '@playwright/test';

const hosted = process.env.RUN_STAGING_INTEGRATION === '1';
const demo = {
  student: 'c0420000-0000-4000-8000-00000000000d',
  academicYear: 'c0420000-0000-4000-8000-000000000001',
  academicPeriod: 'c0420000-0000-4000-8000-000000000002',
  secondAcademicPeriod: 'c0420000-0000-4000-8000-000000000003',
  class: 'c0420000-0000-4000-8000-00000000000c',
  math: 'c0420000-0000-4000-8000-000000000006',
  french: 'c0420000-0000-4000-8000-000000000007',
  successorVersion: 'c0420000-0000-4000-8000-000000000019',
} as const;

function credential(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Hosted integration requires ${name}.`);
  return value;
}

async function signIn(page: Page, emailName: string, passwordName: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(credential(emailName));
  await page.getByLabel('Password').fill(credential(passwordName));
  await page.getByLabel('Password').press('Enter');
  await page.waitForURL(/\/dashboard$/);
}

async function jsonRequest(page: Page, path: string, init?: RequestInit) {
  return page.evaluate(async ({ url, init }) => {
    const response = await fetch(url, init);
    return { status: response.status, body: await response.json() };
  }, { url: path, init });
}

test.describe('conditional STAGING application integration', () => {
  test.skip(!hosted, 'Set RUN_STAGING_INTEGRATION=1 with ignored STAGING credentials.');

  test('real SchoolAdmin session resolves context and an authorized API', async ({ page }) => {
    await signIn(page, 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD');
    const me = await jsonRequest(page, '/api/v1/me');
    const years = await jsonRequest(page, '/api/v1/academic-years?page=1&pageSize=10');
    const versions = await jsonRequest(page, '/api/v1/grading-configuration-versions?page=1&pageSize=10');
    const successorGradebooks = await jsonRequest(page, `/api/v1/gradebooks?gradingConfigurationVersionId=${demo.successorVersion}&page=1&pageSize=10`);

    expect(me.status).toBe(200);
    expect(me.body.data.currentSchool.role).toBe('SCHOOL_ADMIN');
    expect(me.body.data.memberships).toHaveLength(1);
    expect(years.status).toBe(200);
    expect(years.body.data.length).toBeGreaterThan(0);
    expect(versions.body.data).toEqual([
      expect.objectContaining({ id: demo.successorVersion, versionNumber: 2 }),
    ]);
    expect(successorGradebooks.body.data).toHaveLength(2);
  });

  test('real Teacher session is assignment-scoped and denied Period management', async ({ page }) => {
    await signIn(page, 'STAGING_TEACHER_EMAIL', 'STAGING_TEACHER_PASSWORD');
    const me = await jsonRequest(page, '/api/v1/me');
    const profiles = await jsonRequest(page, '/api/v1/teachers?page=1&pageSize=10');
    const assignedResults = await jsonRequest(page, `/api/v1/results/subjects?academicYearId=${demo.academicYear}&academicPeriodId=${demo.secondAcademicPeriod}&classId=${demo.class}&subjectId=${demo.math}&page=1&pageSize=10`);
    const unassignedResults = await jsonRequest(page, `/api/v1/results/subjects?academicYearId=${demo.academicYear}&academicPeriodId=${demo.academicPeriod}&classId=${demo.class}&subjectId=${demo.french}&page=1&pageSize=10`);
    const forbidden = await jsonRequest(page, '/api/v1/results/periods/calculate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        studentId: demo.student,
        academicYearId: demo.academicYear,
        academicPeriodId: demo.academicPeriod,
        classId: demo.class,
      }),
    });

    expect(me.status).toBe(200);
    expect(me.body.data.currentSchool.role).toBe('TEACHER');
    expect(profiles.status).toBe(200);
    expect(profiles.body.data).toHaveLength(1);
    expect(assignedResults.body.data).toHaveLength(1);
    expect(unassignedResults.body.data).toHaveLength(0);
    expect(forbidden.status).toBe(403);
  });

  test('real Parent session resolves only self profiles and rejects staff APIs', async ({ page }) => {
    await signIn(page, 'STAGING_PARENT_EMAIL', 'STAGING_PARENT_PASSWORD');
    const me = await jsonRequest(page, '/api/v1/me');
    const profiles = await jsonRequest(page, '/api/v1/me/parent-profiles');
    const publishedSubjectResults = await jsonRequest(page, `/api/v1/parent/children/${demo.student}/results?academicYearId=${demo.academicYear}&resultType=SUBJECT`);
    const forbidden = await jsonRequest(page, '/api/v1/students?page=1&pageSize=10');

    expect(me.status).toBe(200);
    expect(me.body.data.currentSchool.role).toBe('PARENT');
    expect(profiles.status).toBe(200);
    expect(profiles.body.data).toHaveLength(1);
    expect(profiles.body.data[0].children).toHaveLength(1);
    expect(publishedSubjectResults.body.data).toEqual([
      expect.objectContaining({
        publicationVersion: 2,
        subject: expect.objectContaining({ id: demo.math }),
      }),
    ]);
    expect(JSON.stringify(publishedSubjectResults.body)).not.toMatch(/gradebook|assessments|grades|gradingConfiguration/i);
    expect(forbidden.status).toBe(403);
  });
});
