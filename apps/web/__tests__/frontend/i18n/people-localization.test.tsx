import type { ReactElement } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { cleanup, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUPPORTED_LOCALES, localeDirection } from '@school/shared';
import { StudentsWorkspace } from '@/components/students/students-workspace';
import { StudentDetailWorkspace } from '@/components/students/student-detail';
import { StudentForm } from '@/components/students/student-form';
import { StudentLifecycleActions } from '@/components/students/lifecycle-actions';
import { TeachersWorkspace } from '@/components/teachers/teachers-workspace';
import { TeacherDetailWorkspace } from '@/components/teachers/teacher-detail';
import { ParentsWorkspace } from '@/components/parents/parents-workspace';
import { ParentDetailWorkspace } from '@/components/parents/parent-detail';
import { ChildrenWorkspace } from '@/components/children/children-workspace';
import { ChildDetail } from '@/components/parent/child-detail';
import { PublicationHistory } from '@/components/parent/publication-history';
import { Dashboard } from '@/components/app/dashboard';
import { getCatalog } from '@/i18n/catalogs';
import { useStudentCopy, useTeacherCopy, useParentCopy, useParentPortalCopy, useTeachingCopy } from '@/i18n/use-people-copy';
import { studentCopy } from '@/lib/frontend/students/copy';
import { teacherCopy } from '@/lib/frontend/teachers/copy';
import { parentCopy } from '@/lib/frontend/parents/copy';
import { parentPortalCopy } from '@/lib/frontend/parent-portal/copy';
import { dashboardCopy } from '@/lib/frontend/dashboard/copy';
import * as students from '../students/test-helpers';
import * as teachers from '../teachers/test-helpers';
import * as parents from '../parents/test-helpers';
import * as teaching from '../dashboard/test-helpers';

const navigation = vi.hoisted(() => ({ path: '/students', search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  usePathname: () => navigation.path,
  useRouter: () => ({ replace: navigation.replace }),
}));
type Locale = (typeof SUPPORTED_LOCALES)[number];
const clients: QueryClient[] = [];
// Reuse the existing domain renderers, AppContext and query configuration. The
// inner real provider selects the test locale without changing English defaults.
function localized(ui: ReactElement, locale: Locale) {
  return <NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">
    <div dir={localeDirection(locale)}>{ui}</div>
  </NextIntlClientProvider>;
}
function keep<View extends { queryClient: QueryClient }>(view: View): View { clients.push(view.queryClient); return view; }
const translator = (locale: Locale) => createTranslator({ locale, messages: getCatalog(locale) });
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.restoreAllMocks();
  navigation.path = '/students'; navigation.search = ''; navigation.replace.mockReset();
});

function studentFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/v1/students/' + students.studentId) return Response.json({ data: { ...students.student, dateOfBirth: null } });
    if (url.includes('/academic-years')) return Response.json(students.page([students.year], 1, 100));
    if (url.includes('/classes')) return Response.json(students.page([students.klass], 1, 100));
    if (url.includes('/enrollments/current')) return Response.json({ data: students.enrollment });
    if (url.includes('/enrollments')) return Response.json(students.page([students.enrollment]));
    if (url.startsWith('/api/v1/students?')) return Response.json(students.page([students.student]));
    throw new Error('Unexpected mocked student resource');
  });
}
function teacherFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/v1/teachers/' + teachers.teacherId) return Response.json({ data: teachers.teacher });
    if (url.includes('/academic-years')) return Response.json(teachers.page([teachers.year], 1, 100));
    if (url.includes('/classes')) return Response.json(teachers.page([teachers.klass], 1, 100));
    if (url.includes('/subjects')) return Response.json(teachers.page([teachers.subject], 1, 100));
    if (url.includes('/assignments')) return Response.json(teachers.page([{ ...teachers.assignment, status: 'ENDED', effectiveUntil: '2026-10-01' }]));
    if (url.startsWith('/api/v1/teachers?')) return Response.json(teachers.page([teachers.teacher]));
    throw new Error('Unexpected mocked teacher resource');
  });
}
function parentFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/v1/parents/' + parents.parentId) return Response.json({ data: parents.parent });
    if (url.includes('/parents/' + parents.parentId + '/students')) return Response.json(parents.page([parents.relationship], 1, url.includes('pageSize=100') ? 100 : 20));
    if (url === '/api/v1/students/' + parents.studentId) return Response.json({ data: parents.student });
    if (url.startsWith('/api/v1/parents?')) return Response.json(parents.page([parents.parent]));
    throw new Error('Unexpected mocked parent resource');
  });
}
const child = { relationshipId: parents.relationshipId, student: {
  id: parents.studentId, firstName: parents.student.firstName, lastName: parents.student.lastName, studentCode: parents.student.studentCode,
} };
const profile = { parent: { id: parents.parentId, firstName: parents.parent.firstName, lastName: parents.parent.lastName, status: 'ACTIVE' }, children: [child] };
const historical = {
  publicationId: 'original-publication', resultType: 'SUBJECT', value: '15.50',
  publicationVersion: 1, publishedAt: '2026-01-01T00:00:00.000Z', academicYearId: students.yearId,
  gradingConfigurationVersionId: 'original-rules', state: 'PUBLISHED',
  displayContext: { studentName: 'Original Student', subjectName: 'Original Subject', academicYearName: 'Original Year', academicPeriodName: 'Original Period' },
};
function portalFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/v1/me/parent-profiles') return Response.json({ data: [profile] });
    if (url === '/api/v1/notifications/unread-count') return Response.json({ data: { count: 2 } });
    if (url.endsWith('/academic-years')) return Response.json({ data: [students.year] });
    if (url.includes('/placement?')) return Response.json({ data: {
      academicYearId: students.yearId, academicYearName: students.year.name,
      classId: students.classId, className: students.klass.name, stageName: 'Primary', levelName: 'Year 1', trackName: null,
    } });
    if (url.includes('/results?')) return Response.json({ data: [], meta: { page: 1, pageSize: 50, total: 0 } });
    if (url.includes('/publications/')) return Response.json({ selected: historical, data: [historical], meta: { page: 1, pageSize: 20, total: 1 } });
    if (url.includes('/attendance?')) return Response.json(parents.page([{ id: 'attendance', date: '2026-10-01', className: 'Historical Class', status: 'ABSENT' }]));
    if (url.includes('/homeworks?')) return Response.json(parents.page([{ id: 'homework', title: 'Reading practice', description: 'Original instructions', dueDate: '2026-10-01', status: 'PUBLISHED', subjectName: 'Original Subject', periodName: 'Original Period' }]));
    throw new Error('Unexpected mocked child resource');
  });
}

describe.each(SUPPORTED_LOCALES)('%s people and Parent portal localization', (locale) => {
  it('/students keeps identity data and machine-valued lifecycle filtering', async () => {
    studentFetch(); const t = translator(locale);
    keep(students.renderStudents(localized(<StudentsWorkspace />, locale)));
    const profile = await screen.findByRole('link', { name: t('grades.openDetail', { name: 'Amina Bennani' }) });
    expect(profile).toHaveAttribute('href', '/students/' + students.studentId);
    const row = profile.closest('tr');
    if (!row) throw new Error('Expected the Student profile row');
    expect(within(row).getByRole('cell', { name: 'Amina' })).toBeInTheDocument();
    expect(within(row).getByRole('cell', { name: 'Bennani' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('peopleStudents.createStudent') })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(t('academic.filterStatus')), 'WITHDRAWN');
    expect(navigation.replace).toHaveBeenCalledWith('/students?status=WITHDRAWN&page=1', { scroll: false });
    expect(screen.getByRole('columnheader', { name: t('homework.status') })).toHaveClass('text-start');
  });

  it('/students/[id] preserves explicit-Year placement and enrollment history', async () => {
    const fetchMock = studentFetch(); const t = translator(locale);
    navigation.search = 'academicYearId=' + students.yearId;
    keep(students.renderStudents(localized(<StudentDetailWorkspace studentId={students.studentId} />, locale)));
    expect(await screen.findByText(t('peopleStudents.placementFor', { name: students.year.name }))).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: t('peopleStudents.enrollmentHistory') })).toBeInTheDocument();
    expect(screen.getAllByText(students.klass.name).length).toBeGreaterThan(0);
    expect(screen.getByText(t('peopleStudents.dateOfBirthUnknown'))).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/v1/students/' + students.studentId + '/enrollments/current?academicYearId=' + students.yearId)).toBe(true);
  });

  it('/teachers renders translated creation and preserves the profile name', async () => {
    teacherFetch(); navigation.path = '/teachers'; const t = translator(locale);
    keep(teachers.renderTeachers(localized(<TeachersWorkspace />, locale)));
    const profile = await screen.findByRole('link', { name: t('grades.openDetail', { name: 'Leila Amrani' }) });
    expect(profile).toHaveAttribute('href', '/teachers/' + teachers.teacherId);
    const row = profile.closest('tr');
    if (!row) throw new Error('Expected the Teacher profile row');
    expect(within(row).getByRole('cell', { name: 'Leila' })).toBeInTheDocument();
    expect(within(row).getByRole('cell', { name: 'Amrani' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('peopleTeachers.createTeacher') })).toBeInTheDocument();
  });

  it('/teachers/[id] retains ENDED assignment dates and immutable academic context', async () => {
    teacherFetch(); const t = translator(locale);
    keep(teachers.renderTeachers(localized(<TeacherDetailWorkspace teacherId={teachers.teacherId} />, locale)));
    expect(await screen.findByRole('heading', { name: 'Leila Amrani' })).toBeInTheDocument();
    expect(await screen.findByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByText('2026-10-01')).toBeInTheDocument();
    expect(screen.getByText(t('peopleUi.ENDED'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('peopleTeachers.endAssignment') })).not.toBeInTheDocument();
    expect(screen.queryByText(teachers.userId)).not.toBeInTheDocument();
  });

  it('/parents preserves machine-valued status choices under translated labels', async () => {
    parentFetch(); navigation.path = '/parents'; const t = translator(locale);
    keep(parents.renderParents(localized(<ParentsWorkspace />, locale)));
    const profile = await screen.findByRole('link', { name: t('grades.openDetail', { name: 'Samira Alaoui' }) });
    expect(profile).toHaveAttribute('href', '/parents/' + parents.parentId);
    const row = profile.closest('tr');
    if (!row) throw new Error('Expected the Parent profile row');
    expect(within(row).getByRole('cell', { name: 'Samira' })).toBeInTheDocument();
    expect(within(row).getByRole('cell', { name: 'Alaoui' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('peopleParents.createParent') })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(t('academic.filterStatus')), 'ARCHIVED');
    expect(navigation.replace).toHaveBeenCalledWith('/parents?status=ARCHIVED&page=1', { scroll: false });
  });

  it('/parents/[id] preserves relationship identity and account privacy', async () => {
    parentFetch(); const t = translator(locale);
    keep(parents.renderParents(localized(<ParentDetailWorkspace parentId={parents.parentId} />, locale)));
    expect(await screen.findByRole('heading', { name: 'Samira Alaoui' })).toBeInTheDocument();
    expect(await screen.findByText('Nora Alaoui')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t('peopleParents.relationshipHistory') })).toBeInTheDocument();
    expect(screen.queryByText(parents.userId)).not.toBeInTheDocument();
  });

  it('/children shows only self-bootstrap children and an isolated child name', async () => {
    const fetchMock = portalFetch(); const t = translator(locale);
    keep(parents.renderParents(localized(<ChildrenWorkspace />, locale), 'PARENT'));
    expect(await screen.findByRole('heading', { name: 'Nora Alaoui' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: t('parentPortal.viewChild', { name: 'Nora Alaoui' }) });
    expect(link).toHaveAttribute('href', '/children/' + parents.studentId);
    expect(link.querySelector('svg')).toHaveClass('rtl:rotate-180');
    expect(screen.getByRole('heading', { name: 'Nora Alaoui' }).querySelector('bdi')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['/api/v1/me/parent-profiles']);
  });

  it('/children/[studentId] keeps journeys read-only and attendance statuses translated', async () => {
    const fetchMock = portalFetch(); const t = translator(locale);
    keep(parents.renderParents(localized(<ChildDetail studentId={parents.studentId} />, locale), 'PARENT'));
    await screen.findByText('Primary');
    await userEvent.click(screen.getByRole('button', { name: t('navigation.items.attendance') }));
    expect(await screen.findByText(/Historical Class/)).toHaveTextContent(t('attendance.statuses.ABSENT'));
    expect(screen.getByLabelText(t('attendance.dateFrom'))).toHaveAttribute('dir', 'ltr');
    await userEvent.click(screen.getByRole('button', { name: t('peopleUi.backOverview') }));
    expect(screen.getByRole('button', { name: t('navigation.items.attendance') })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: t('navigation.items.homework') }));
    expect(await screen.findByText('Original instructions')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('homework.createSubmission') })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => /\/(attendance|homeworks)\?/.test(String(url))).every(([url]) => String(url).startsWith('/api/v1/parent/children/' + parents.studentId + '/'))).toBe(true);
  });

  it('/children/[studentId]/results/[publicationId] displays original snapshots without mutation', async () => {
    portalFetch(); const before = JSON.stringify(historical); const t = translator(locale);
    keep(parents.renderParents(localized(<PublicationHistory studentId={parents.studentId} publicationId="original-publication" />, locale), 'PARENT'));
    expect(await screen.findByRole('heading', { name: t('domainUi.publicationHistory') })).toBeInTheDocument();
    expect(screen.getAllByText('Original Student')).toHaveLength(2);
    expect(screen.getAllByText('Original Subject')).toHaveLength(2);
    expect(screen.queryByText('Nora Alaoui')).not.toBeInTheDocument();
    expect(screen.getAllByText(t('domainUi.publishedValue', { value: '15.50' }))).toHaveLength(2);
    expect(JSON.stringify(historical)).toBe(before);
  });

  it('keeps an unrelated child hidden without querying academic or publication resources', async () => {
    const fetchMock = portalFetch(); const t = translator(locale);
    keep(parents.renderParents(localized(<ChildDetail studentId={parents.otherStudentId} />, locale), 'PARENT'));
    expect(await screen.findByText(t('parentPortal.childUnavailable'))).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['/api/v1/me/parent-profiles']);
  });

  it('denies Parent administration and Teacher child-portal access before fetching', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); const t = translator(locale);
    const first = keep(parents.renderParents(localized(<ParentsWorkspace />, locale), 'PARENT'));
    expect(screen.getByRole('heading', { name: t('states.accessDenied.title') })).toBeInTheDocument();
    first.unmount();
    keep(parents.renderParents(localized(<ChildrenWorkspace />, locale), 'TEACHER'));
    expect(screen.getByRole('heading', { name: t('states.accessDenied.title') })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders Teacher self scope without administration controls', async () => {
    teacherFetch(); const t = translator(locale);
    keep(teachers.renderTeachers(localized(<TeachersWorkspace />, locale), 'TEACHER'));
    const profile = await screen.findByRole('link', { name: t('grades.openDetail', { name: 'Leila Amrani' }) });
    expect(profile).toHaveAttribute('href', '/teachers/' + teachers.teacherId);
    const row = profile.closest('tr');
    if (!row) throw new Error('Expected the self-scoped Teacher profile row');
    expect(within(row).getByRole('cell', { name: 'Leila' })).toBeInTheDocument();
    expect(within(row).getByRole('cell', { name: 'Amrani' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t('peopleTeachers.selfTitle') })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('peopleTeachers.createTeacher') })).not.toBeInTheDocument();
  });

  it('keeps an intentional Student withdrawal confirmation and its machine payload', async () => {
    const withdrawn = { ...students.student, status: 'WITHDRAWN' as const };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ data: withdrawn }));
    const saved = vi.fn(); const t = translator(locale);
    keep(students.renderStudents(localized(<StudentLifecycleActions student={students.student} onSaved={saved} />, locale)));
    await userEvent.click(screen.getByRole('button', { name: t('peopleStudents.withdraw') }));
    await userEvent.click(screen.getByRole('button', { name: t('collection.confirm') }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(withdrawn));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/students/' + students.studentId,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'WITHDRAWN' }) }));
  });

  it('distinguishes no Parent profile and a failed bootstrap without exposing provider details', async () => {
    const t = translator(locale);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ data: [] }));
    const first = keep(parents.renderParents(localized(<ChildrenWorkspace />, locale), 'PARENT'));
    expect(await screen.findByText(t('parentPortal.noProfile'))).toBeInTheDocument();
    first.unmount();
    fetchMock.mockImplementation(async () => Response.json({ error: {
      code: 'INTERNAL_ERROR', message: 'private provider details',
    } }, { status: 500 }));
    keep(parents.renderParents(localized(<ChildrenWorkspace />, locale), 'PARENT'));
    expect(await screen.findByText(t('parentPortal.unavailable'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('foundation.actions.retry') })).toBeInTheDocument();
    expect(screen.queryByText('private provider details')).not.toBeInTheDocument();
  });

  it('localizes real form validation while preserving invalid-field focus and no-write behavior', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); const t = translator(locale);
    keep(students.renderStudents(localized(<StudentForm onCancel={vi.fn()} onSaved={vi.fn()} />, locale)));
    await userEvent.click(screen.getByRole('button', { name: t('grades.create') }));
    await waitFor(() => expect(screen.getByLabelText(t('peopleStudents.firstName'))).toHaveFocus());
    expect(screen.getByLabelText(t('peopleStudents.firstName'))).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByText(t('peopleUi.dobInvalid'))).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the Parent dashboard through the existing role branch and unread plurals', async () => {
    portalFetch(); const t = translator(locale);
    keep(parents.renderParents(localized(<Dashboard />, locale), 'PARENT'));
    expect(await screen.findByRole('heading', { name: t('parentPortal.dashboardTitle') })).toBeInTheDocument();
    expect(screen.getByText(t('parentPortal.unreadDescription', { count: 2 }))).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: t('teachingDashboard.teacherTitle') })).not.toBeInTheDocument();
  });

  it('localizes server DOB feedback and retains the original field-focus and request contract', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid date', details: { issues: [{
        path: 'dateOfBirth', message: 'Date of birth cannot be after today in the School timezone.',
      }] } },
    }, { status: 400 }));
    const t = translator(locale);
    keep(students.renderStudents(localized(<StudentForm initial={{ ...students.student, dateOfBirth: '2012-02-29' }} onCancel={vi.fn()} onSaved={vi.fn()} />, locale)));
    const date = screen.getByLabelText(t('peopleStudents.dateOfBirth'));
    fireEvent.change(date, { target: { value: '2099-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: t('grades.save') }));
    expect(await screen.findByText(t('peopleUi.dobFuture'))).toBeInTheDocument();
    expect(date).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/students/' + students.studentId,
      expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"dateOfBirth":"2099-01-01"') }));
  });

  it('renders the Teacher dashboard with exact assignment navigation', async () => {
    teaching.successfulDashboardFetch(); const t = translator(locale);
    keep(teaching.renderDashboard(localized(<Dashboard />, locale)));
    expect(await screen.findByRole('heading', { name: t('teachingDashboard.teacherTitle') })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: t('teachingDashboard.gradeAction', { subjectName: 'Mathematics', className: '1A' }) });
    expect(link.getAttribute('href')).toContain('subjectId=' + teaching.subjectId);
    expect(screen.queryByRole('heading', { name: t('parentPortal.dashboardTitle') })).not.toBeInTheDocument();
  });
});

function expectCopyStrings(actual: object, reference: object) {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(reference).sort());
  for (const [key, value] of Object.entries(reference)) {
    if (typeof value === 'string') expect(Reflect.get(actual, key), key).toBe(value);
    else expect(typeof Reflect.get(actual, key), key).toBe('function');
  }
}
it('retains the English copy interfaces, ICU arguments and undefined-count behavior', () => {
  const { result } = renderHook(() => ({
    students: useStudentCopy(), teachers: useTeacherCopy(), parents: useParentCopy(),
    portal: useParentPortalCopy(), teaching: useTeachingCopy(),
  }), { wrapper: ({ children }) => <NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC">{children}</NextIntlClientProvider> });
  expectCopyStrings(result.current.students, studentCopy);
  expectCopyStrings(result.current.teachers, teacherCopy);
  expectCopyStrings(result.current.parents, parentCopy);
  expectCopyStrings(result.current.portal, parentPortalCopy);
  expectCopyStrings(result.current.teaching, dashboardCopy);
  expect(result.current.students.placementFor('2026/2027')).toBe(studentCopy.placementFor('2026/2027'));
  expect(result.current.teachers.lifecycleDescription('INACTIVE', 'Leila')).toBe(teacherCopy.lifecycleDescription('INACTIVE', 'Leila'));
  expect(result.current.parents.lifecycleDescription('ARCHIVED', 'Samira')).toBe(parentCopy.lifecycleDescription('ARCHIVED', 'Samira'));
  expect(result.current.portal.notificationsDescription(undefined)).toBe(parentPortalCopy.notificationsDescription(undefined));
  for (const count of [0, 1, 2, 3, 11, 100]) expect(result.current.portal.notificationsDescription(count)).toBe(parentPortalCopy.notificationsDescription(count));
});
