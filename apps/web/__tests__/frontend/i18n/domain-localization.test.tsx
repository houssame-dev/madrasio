import type { ReactElement } from 'react';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUPPORTED_LOCALES, localeDirection } from '@school/shared';
import { AppContextProvider } from '@/components/app/app-context';
import { AcademicWorkspace } from '@/components/academic/academic-workspace';
import { YearForm } from '@/components/academic/forms';
import { AttendanceWorkspace } from '@/components/attendance/attendance-workspace';
import { AttendanceStatusControl } from '@/components/attendance/attendance-status-control';
import { GradebooksWorkspace } from '@/components/grades/gradebooks-workspace';
import { GradebookDetailWorkspace } from '@/components/grades/gradebook-detail';
import { GradingConfigurationWorkspace, GradingRulesForm } from '@/components/grades/configuration-workspace';
import { ResultsWorkspace } from '@/components/grades/results/results-workspace';
import { HomeworkWorkspace } from '@/components/homework/homework-workspace';
import { HomeworkDetailWorkspace } from '@/components/homework/homework-detail';
import { SubmissionTiming } from '@/components/homework/submission-timing';
import { SubmissionAttachments } from '@/components/homework/submission-attachments';
import { HomeworkLifecycleActions } from '@/components/homework/homework-lifecycle-actions';
import { Snapshot } from '@/components/grades/results/publication-snapshot';
import { getCatalog } from '@/i18n/catalogs';
import { useDomainText } from '@/i18n/use-domain-text';
import { useAcademicCopy, useAttendanceCopy, useGradeCopy, useHomeworkCopy } from '@/i18n/use-domain-copy';
import { academicCopy } from '@/lib/frontend/academic/copy';
import { attendanceCopy } from '@/lib/frontend/attendance/copy';
import { gradeCopy } from '@/lib/frontend/grades/copy';
import { homeworkCopy } from '@/lib/frontend/homework/copy';
import type { Role } from '@/lib/authorization/roles';
import { configurationApi } from '@/lib/frontend/grades/configuration';
import * as grades from '../grades/test-helpers';
import * as homework from '../homework/test-helpers';

const navigation = vi.hoisted(() => ({ path: '/academic', search: '', replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  usePathname: () => navigation.path,
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
}));

type Locale = (typeof SUPPORTED_LOCALES)[number];
const clients: QueryClient[] = [];
function mount(ui: ReactElement, locale: Locale, role: Role = 'SCHOOL_ADMIN', family: 'grades' | 'homework' = 'grades') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const fixture = family === 'grades' ? grades : homework;
  return render(
    <NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">
      <QueryClientProvider client={client}>
        <AppContextProvider value={{
          user: { id: fixture.userId },
          currentSchool: { id: fixture.schoolId, role, timezone: 'UTC' },
          memberships: [{ schoolId: fixture.schoolId, schoolName: 'مدرسة Atlas', role, status: 'ACTIVE' }],
        }}>
          <div dir={localeDirection(locale)}>{ui}</div>
        </AppContextProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}
const translator = (locale: Locale) => createTranslator({ locale, messages: getCatalog(locale) });

afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.restoreAllMocks();
  navigation.path = '/academic';
  navigation.search = '';
  navigation.replace.mockReset();
  navigation.push.mockReset();
});

function resultsFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/v1/results/subjects?')) return Response.json(grades.page([grades.subjectResult]));
    if (url.startsWith('/api/v1/academic-years?')) return Response.json(grades.page([grades.year], 1, 100));
    if (url.startsWith('/api/v1/classes?')) return Response.json(grades.page([grades.klass], 1, 100));
    if (url.startsWith('/api/v1/subjects?')) return Response.json(grades.page([grades.subject], 1, 100));
    if (url.startsWith('/api/v1/students?')) return Response.json(grades.page([grades.student], 1, 100));
    if (url.startsWith('/api/v1/gradebooks?')) return Response.json(grades.page([grades.gradebook], 1, 100));
    throw new Error('Unexpected mocked result resource');
  });
}
function homeworkFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/v1/homeworks?')) return Response.json(homework.page([homework.homework]));
    if (url === '/api/v1/homeworks/' + homework.homeworkId) return Response.json({ data: homework.publishedHomework });
    if (url.startsWith('/api/v1/academic-years?')) return Response.json(homework.page([homework.year], 1, 100));
    if (url.startsWith('/api/v1/classes?')) return Response.json(homework.page([homework.classA], 1, 100));
    if (url.startsWith('/api/v1/subjects?')) return Response.json(homework.page([homework.subject], 1, 100));
    if (url.includes('/periods?')) return Response.json(homework.page([homework.period], 1, 100));
    if (url.startsWith('/api/v1/teachers?')) return Response.json(homework.page([homework.teacher], 1, 100));
    if (url.includes('/assignments?')) return Response.json(homework.page([homework.assignmentA], 1, 100));
    if (url === '/api/v1/teachers/' + homework.teacherId) return Response.json({ data: homework.teacher });
    if (url.endsWith('/targets')) return Response.json({ data: [homework.target] });
    if (url.includes('/students?')) return Response.json(homework.roster());
    throw new Error('Unexpected mocked homework resource');
  });
}

describe.each(SUPPORTED_LOCALES)('%s domain localization with real catalogs', (locale) => {
  it('/academic renders translated empty, action and logical table alignment', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(grades.page([])));
    const t = translator(locale);
    mount(<AcademicWorkspace />, locale);
    expect(await screen.findByText(t('collection.empty'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t('navigation.items.academic') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('academic.createYear') })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: t('academic.name') })).toHaveClass('text-start');
  });

  it('/attendance translates context, date labels and daily/history actions', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/v1/academic-years?page=1&pageSize=100' || url === '/api/v1/classes?page=1&pageSize=100') {
        return Response.json(grades.page([], 1, 100));
      }
      throw new Error('Unexpected mocked attendance context resource');
    });
    navigation.path = '/attendance';
    const t = translator(locale);
    mount(<AttendanceWorkspace />, locale);
    expect(await screen.findByRole('button', { name: t('attendance.daily') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('attendance.history') })).toBeInTheDocument();
    expect(screen.getByLabelText(t('attendance.date'))).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('heading', { name: t('attendance.selectContext') })).toBeInTheDocument();
  });

  it('localizes Class search controls while preserving URL search semantics', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(grades.page([], 1, 100)));
    navigation.search = 'section=classes';
    const t = translator(locale);
    mount(<AcademicWorkspace />, locale);
    const search = await screen.findByRole('searchbox', { name: t('domainUi.searchClasses') });
    await userEvent.type(search, 'Atlas');
    await userEvent.click(screen.getByRole('button', { name: t('academic.search') }));
    expect(navigation.replace).toHaveBeenCalledWith('/academic?section=classes&search=Atlas&page=1', { scroll: false });
    await userEvent.click(screen.getByRole('button', { name: t('domainUi.clearSearch') }));
    expect(search).toHaveValue('');
  });

  it('/grades preserves names and machine status filters under translated labels', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    grades.setupGradebookFetch(fetchMock);
    navigation.path = '/grades';
    const t = translator(locale);
    mount(<GradebooksWorkspace />, locale);
    expect(await screen.findByText(grades.gradebook.name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('grades.createGradebook') })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(t('grades.status')), 'DRAFT');
    expect(navigation.replace).toHaveBeenCalledWith('/grades?status=DRAFT&page=1', { scroll: false });
  });

  it('/grades/[id] keeps exact academic context, read-only IDs and back-arrow direction', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    grades.setupGradebookFetch(fetchMock);
    navigation.path = '/grades/' + grades.gradebookId;
    const t = translator(locale);
    mount(<GradebookDetailWorkspace gradebookId={grades.gradebookId} />, locale);
    expect(await screen.findByRole('heading', { name: grades.gradebook.name })).toBeInTheDocument();
    expect(screen.getByText(grades.versionId)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('grades.createAssessment') })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('grades.back') }).querySelector('svg')).toHaveClass('rtl:rotate-180');
  });

  it('/grades/configuration opens the real draft form and preserves calculation enum values', async () => {
    vi.spyOn(configurationApi, 'list').mockResolvedValue({ data: [], meta: { total: 0 } });
    navigation.path = '/grades/configuration';
    const t = translator(locale);
    mount(<GradingConfigurationWorkspace />, locale);
    await userEvent.click(await screen.findByRole('button', { name: t('domainUi.createConfiguration') }));
    const calculation = screen.getByLabelText(t('domainUi.periodCalculation'));
    expect(calculation).toHaveValue('SIMPLE_AVERAGE');
    await userEvent.selectOptions(calculation, 'WEIGHTED_AVERAGE');
    expect(calculation).toHaveValue('WEIGHTED_AVERAGE');
    expect(screen.getByRole('button', { name: t('domainUi.saveDraft') })).toBeInTheDocument();
  });

  it('/grades/results keeps translated status filters machine-valued and Teacher scope narrow', async () => {
    resultsFetch();
    navigation.path = '/grades/results';
    const t = translator(locale);
    mount(<ResultsWorkspace />, locale, 'TEACHER');
    expect(await screen.findByText('12.25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('grades.calculateSubject') })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('grades.periodResults') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('grades.annualResults') })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(t('grades.status')), 'FINALIZED');
    expect(navigation.replace).toHaveBeenCalledWith('/grades/results?status=FINALIZED&page=1', { scroll: false });
  });

  it('/homework translates filters and actions while preserving the authored title', async () => {
    homeworkFetch();
    navigation.path = '/homework';
    const t = translator(locale);
    mount(<HomeworkWorkspace />, locale, 'SCHOOL_ADMIN', 'homework');
    expect(await screen.findByText(homework.homework.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('homework.create') })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(t('homework.status')), 'PUBLISHED');
    expect(navigation.replace).toHaveBeenCalledWith('/homework?status=PUBLISHED&page=1', { scroll: false });
  });

  it('/homework/[id] translates frozen targets and null submission state without changing roster data', async () => {
    homeworkFetch();
    navigation.path = '/homework/' + homework.homeworkId;
    const t = translator(locale);
    mount(<HomeworkDetailWorkspace homeworkId={homework.homeworkId} />, locale, 'SCHOOL_ADMIN', 'homework');
    expect(await screen.findByText(t('homework.targetFrozen'))).toBeInTheDocument();
    expect(await screen.findByText('Sara Amrani')).toBeInTheDocument();
    expect(screen.getByText(t('homework.notSubmitted'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('homework.addTargets') })).not.toBeInTheDocument();
  });

  it('rejects Parent gradebook access before any raw domain fetch', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const t = translator(locale);
    mount(<GradebookDetailWorkspace gradebookId={grades.gradebookId} />, locale, 'PARENT');
    expect(screen.getByRole('heading', { name: t('states.accessDenied.title') })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps Teacher academic access read-only', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(grades.page([])));
    const t = translator(locale);
    mount(<AcademicWorkspace />, locale, 'TEACHER');
    expect(await screen.findByText(t('collection.empty'))).toBeInTheDocument();
    expect(screen.getByText(t('academic.readOnly'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('academic.createYear') })).not.toBeInTheDocument();
  });

  it('renders date-order validation from the real schema and sends no write', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const t = translator(locale);
    mount(<YearForm onCancel={vi.fn()} onSaved={vi.fn()} />, locale);
    await userEvent.type(screen.getByLabelText(t('academic.name')), '2026/2027');
    await userEvent.type(screen.getByLabelText(t('academic.startDate')), '2027-09-01');
    await userEvent.type(screen.getByLabelText(t('academic.endDate')), '2027-06-30');
    await userEvent.click(screen.getByRole('button', { name: t('academic.create') }));
    expect(await screen.findByText(t('domainUi.endAfterStart'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('academic.endDate'))).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('translates a failed list without displaying provider diagnostics', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({
      error: { code: 'INTERNAL_ERROR', message: 'private provider diagnostic' },
    }, { status: 500 }));
    const t = translator(locale);
    mount(<AcademicWorkspace />, locale);
    expect(await screen.findByText(t('academic.listError'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('foundation.actions.retry') })).toBeInTheDocument();
    expect(screen.queryByText('private provider diagnostic')).not.toBeInTheDocument();
  });

  it('selects the original Attendance status through its translated accessible name', async () => {
    const change = vi.fn();
    const t = translator(locale);
    mount(<AttendanceStatusControl name="Sara" value="" onChange={change} />, locale);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: t('attendance.statusFor', { name: 'Sara' }) }), 'LATE');
    expect(change).toHaveBeenCalledWith('LATE');
    expect(screen.getByRole('option', { name: t('attendance.statuses.LATE') })).toHaveValue('LATE');
  });

  it('keeps school-local submission time independent of UI language', () => {
    const t = translator(locale);
    mount(<SubmissionTiming submittedAt="2025-10-11T09:00:00.000Z" actualHandedInAt={null} />, locale);
    expect(screen.getByText(t('homework.unknownActual'))).toBeInTheDocument();
    expect(screen.getByText('2025-10-11 09:00 (UTC)')).toBeInTheDocument();
  });

  it('localizes mapped and bounded validation feedback without leaking unknown diagnostics', () => {
    function Feedback() {
      const text = useDomainText();
      return <div>{text('String must contain at most 200 character(s)')}<p>{text('unrecognized private diagnostic')}</p>
        <p>{text('UNCONFIGURED')}</p>
        <p>{text('Required assessment type "EXAM" has no assessment in the gradebook.')}</p>
      </div>;
    }
    const t = translator(locale);
    mount(<Feedback />, locale);
    expect(screen.getByText(t('domainUi.maxLength', { maximum: 200 }))).toBeInTheDocument();
    expect(screen.getByText(t('domainUi.invalid'))).toBeInTheDocument();
    expect(screen.queryByText('unrecognized private diagnostic')).not.toBeInTheDocument();
    expect(screen.getByText(t('domainCalculation.UNCONFIGURED'))).toBeInTheDocument();
    expect(screen.getByText(t('domainCalculation.missingType', { type: t('domainEnums.EXAM') }))).toBeInTheDocument();
  });

  it('keeps invalid grading rules blocked after translating the form', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const t = translator(locale);
    mount(<GradingRulesForm creating save={save} onCancel={vi.fn()} />, locale);
    await userEvent.click(screen.getByRole('button', { name: t('domainUi.saveDraft') }));
    await waitFor(() => expect(screen.getByLabelText(t('domainUi.configurationName'))).toHaveFocus());
    expect(save).not.toHaveBeenCalled();
  });

  it('confirms a translated Homework lifecycle action with the unchanged machine payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({ data: homework.publishedHomework }));
    const t = translator(locale);
    mount(<HomeworkLifecycleActions schoolId={homework.schoolId} homeworkId={homework.homeworkId} status="DRAFT" />, locale);
    await userEvent.click(screen.getByRole('button', { name: t('homework.publish') }));
    expect(screen.getByText(t('homework.publishDescription'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t('collection.confirm') }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/homeworks/' + homework.homeworkId,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'PUBLISHED' }) }),
    ));
  });

  it('preserves historical snapshot fields while translating publication metadata', () => {
    const t = translator(locale);
    const snapshot = {
      publicationId: 'historical-publication', resultType: 'SUBJECT', value: '12.25',
      publicationVersion: 2, publishedAt: '2026-01-01T00:00:00.000Z',
      academicYearId: grades.yearId, gradingConfigurationVersionId: grades.versionId,
      displayContext: null, state: 'REVISED' as const,
    };
    const before = JSON.stringify(snapshot);
    mount(<Snapshot value={snapshot} />, locale);
    expect(screen.getByText(t('domainUi.historicalLabels'))).toBeInTheDocument();
    expect(screen.getByText(t('domainUi.publishedValue', { value: '12.25' }))).toBeInTheDocument();
    expect(screen.getByText('2026-01-01T00:00:00.000Z')).toHaveAttribute('dir', 'ltr');
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('isolates delivered filenames and keeps upload controls absent for read-only submissions', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ data: [{
      id: 'attachment', name: 'تمرين Atlas.pdf', byteSize: 1024,
      submissionRecordedAt: '2025-10-11T09:00:00.000Z',
    }] }));
    const t = translator(locale);
    mount(<SubmissionAttachments submissionId={homework.submissionId} />, locale);
    const file = await screen.findByRole('link', { name: 'تمرين Atlas.pdf' });
    expect(file.querySelector('bdi')).toHaveTextContent('تمرين Atlas.pdf');
    expect(file).toHaveAttribute('href', '/api/v1/homework-submissions/' + homework.submissionId + '/attachments/attachment/download');
    expect(screen.queryByRole('button', { name: t('domainUi.upload') })).not.toBeInTheDocument();
  });
});

// Compare the real adapter output with the preserved English contracts, including
// every nested string; function results are checked with their real arguments.
function expectCopyStrings(actual: object, reference: object) {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(reference).sort());
  for (const [key, value] of Object.entries(reference)) {
    const translated: unknown = Reflect.get(actual, key);
    if (typeof value === 'string') expect(translated, key).toBe(value);
    else if (typeof value === 'function') expect(typeof translated, key).toBe('function');
    else {
      expect(translated).toBeTypeOf('object');
      if (typeof translated === 'object' && translated !== null) expectCopyStrings(translated, value);
    }
  }
}

it('preserves the English domain copy interfaces and interpolation results', () => {
  const { result } = renderHook(() => ({
    academic: useAcademicCopy(), attendance: useAttendanceCopy(),
    grades: useGradeCopy(), homework: useHomeworkCopy(),
  }), { wrapper: ({ children }) =>
    <NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC">{children}</NextIntlClientProvider> });
  expectCopyStrings(result.current.academic, academicCopy);
  expectCopyStrings(result.current.attendance, attendanceCopy);
  expectCopyStrings(result.current.grades, gradeCopy);
  expectCopyStrings(result.current.homework, homeworkCopy);
  expect(result.current.academic.periodsFor('2026/2027')).toBe(academicCopy.periodsFor('2026/2027'));
  expect(result.current.attendance.statusFor('Sara')).toBe(attendanceCopy.statusFor('Sara'));
  expect(result.current.grades.versionLabel('Standard', 2)).toBe(gradeCopy.versionLabel('Standard', 2));
  expect(result.current.grades.scoreAboveMaximum('20.00')).toBe(gradeCopy.scoreAboveMaximum('20.00'));
  expect(result.current.grades.lifecycleDescription('CLOSED')).toBe(gradeCopy.lifecycleDescription('CLOSED'));
  expect(result.current.homework.lifecycleTitle('Publish')).toBe(homeworkCopy.lifecycleTitle('Publish'));
});
