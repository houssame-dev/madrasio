'use client';
import { useSearchParams } from 'next/navigation';
import { usePeopleText } from '@/i18n/use-people-text';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, GraduationCap } from 'lucide-react';
import { ChildTuition } from '@/components/finance/child-tuition';
import { ChildResultsWorkspace } from './child-results-workspace';
import { PublishedResults } from './published-results';
import { ChildJourneys } from './child-journeys';
import Link from 'next/link';
import { selectClassName } from '@/components/academic/ui';
import { useAppContext } from '@/components/app/app-context';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { ApiErrorState, EmptyState, InlineLoading } from '@/components/ui/states';
import { useParentPortalCopy } from '@/i18n/use-people-copy';
import { childAcademicYearsQuery, childPlacementQuery, parentBootstrapQuery } from '@/lib/frontend/parent-portal/queries';
import { relatedChildren } from '@/lib/frontend/parent-portal/types';
import { can } from '@/lib/frontend/permissions';

export function ChildDetail({ studentId, academicYearId }: { studentId: string; academicYearId?: string }) {
  const t = useParentPortalCopy();
  const text = usePeopleText();

  const section = useSearchParams()?.get('section');
  const attendanceOnly = section === 'attendance';
  const resultsOnly = section === 'results';
  const homeworkOnly = section === 'homework';
  const focused = attendanceOnly || resultsOnly || homeworkOnly;
  const context = useAppContext();
  const role = context.currentSchool?.role;
  const schoolId = context.currentSchool?.id;
  const allowed = role === 'PARENT' && !!schoolId && can(role, 'parents.read');
  const profiles = useQuery({ ...parentBootstrapQuery(schoolId ?? 'no-school'), enabled: allowed });
  const child = profiles.data ? relatedChildren(profiles.data).find((item) => item.id === studentId) : undefined;
  const years = useQuery({ ...childAcademicYearsQuery(schoolId ?? 'no-school', studentId), enabled: allowed && !!child });
  const eligibleYears = years.data ?? [];
  const requestedYear = eligibleYears.some((year) => year.id === academicYearId) ? academicYearId : undefined;
  const activeYears = eligibleYears.filter((year) => year.status === 'ACTIVE');
  const selectedYearId = requestedYear ?? (eligibleYears.length === 1 ? eligibleYears[0]?.id : activeYears.length === 1 ? activeYears[0]?.id : undefined) ?? '';
  const academicEnabled = allowed && !!child && !!selectedYearId;
  const placement = useQuery({ ...childPlacementQuery(schoolId ?? 'no-school', studentId, selectedYearId), enabled: academicEnabled });

  if (!allowed || !schoolId) return <AccessDeniedWithReturn />;
  if (profiles.isPending) return <InlineLoading label={t.childrenLoading} />;
  if (profiles.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => void profiles.refetch()} />;
  if (!child) return <EmptyState title={t.childUnavailable} description={t.childUnavailableDescription} action={<Link className="text-sm font-medium underline underline-offset-4" href="/children">{t.backToChildren}</Link>} />;
  const academicError = placement.isError;
  return <div className={`mx-auto max-w-5xl space-y-6 ${attendanceOnly ? 'attendance-workspace at-parent-page' : resultsOnly ? 'gr-workspace' : ''}`}><Link href="/children" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />{t.backToChildren}</Link>
    <header><h1 className="text-2xl font-semibold tracking-tight"><bdi>{child.firstName} {child.lastName}</bdi></h1><p className="mt-1 text-sm text-muted-foreground">{t.studentCode}: <bdi>{child.studentCode ?? t.unknown}</bdi></p></header>
    {!focused ? <><section className="rounded-lg border bg-card p-5" aria-labelledby="child-overview-heading"><div className="flex items-center gap-2"><GraduationCap className="size-5 text-muted-foreground" aria-hidden="true" /><h2 id="child-overview-heading" className="text-lg font-semibold">{t.overview}</h2></div><p className="mt-3 text-sm text-muted-foreground">{t.noManagement}</p></section></> : null}
    {years.isPending ? <InlineLoading label={t.childrenLoading} /> : years.isError ? <ApiErrorState title={t.academicDataUnavailable} description={t.academicDataUnavailableDescription} onRetry={() => void years.refetch()} /> : eligibleYears.length === 0 ? <EmptyState title={t.noAcademicYears} /> : <>
      <form method="get" className="rounded-lg border bg-card p-5">{focused ? <input type="hidden" name="section" value={section} /> : null}<label htmlFor="academicYearId" className="mb-2 block text-sm font-medium">{t.academicYear}</label><div className="flex flex-col gap-3 sm:flex-row"><select id="academicYearId" name="academicYearId" className={selectClassName} defaultValue={selectedYearId} required><option value="">{t.chooseAcademicYear}</option>{eligibleYears.map((year) => <option key={year.id} value={year.id}>{year.name} · {text(year.status)}</option>)}</select><button type="submit" className="min-h-10 rounded-md border px-4 text-sm font-medium hover:bg-muted">{t.viewAcademicYear}</button></div>{!selectedYearId ? <p className="mt-2 text-sm text-muted-foreground">{t.selectAcademicYear}</p> : null}</form>
      {selectedYearId ? academicError ? <ApiErrorState title={t.academicDataUnavailable} description={t.academicDataUnavailableDescription} onRetry={() => { void placement.refetch(); }} /> : placement.isPending ? <InlineLoading label={t.childrenLoading} /> : <>
        <section hidden={focused} id="placement" className="rounded-lg border bg-card p-5" aria-labelledby="placement-heading"><h2 id="placement-heading" className="text-lg font-semibold">{t.academicPlacement}</h2>{placement.data ? <dl className="mt-3 grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">{t.academicYear}</dt><dd dir="auto" className="font-medium">{placement.data.academicYearName}</dd></div><div><dt className="text-sm text-muted-foreground">{t.classLabel}</dt><dd dir="auto" className="font-medium">{placement.data.className}</dd></div><div><dt className="text-sm text-muted-foreground">{t.stageLabel}</dt><dd dir="auto" className="font-medium">{placement.data.stageName}</dd></div><div><dt className="text-sm text-muted-foreground">{t.levelLabel}</dt><dd dir="auto" className="font-medium">{placement.data.levelName}</dd></div>{placement.data.trackName ? <div><dt className="text-sm text-muted-foreground">{t.trackLabel}</dt><dd dir="auto" className="font-medium">{placement.data.trackName}</dd></div> : null}</dl> : <p className="mt-3 text-sm text-muted-foreground">{t.placementUnavailable}</p>}</section>
        {resultsOnly ? <ChildResultsWorkspace schoolId={schoolId} studentId={studentId} yearId={selectedYearId}/> : <div hidden={attendanceOnly} id="results" className={attendanceOnly ? 'hidden' : 'grid gap-4 lg:grid-cols-3'}>{!attendanceOnly && !homeworkOnly && (['SUBJECT', 'PERIOD', 'ANNUAL'] as const).map((type) => <PublishedResults key={`${schoolId}:${studentId}:${selectedYearId}:${type}`} schoolId={schoolId} studentId={studentId} yearId={selectedYearId} type={type} title={type === 'SUBJECT' ? t.subjectResults : type === 'PERIOD' ? t.periodResults : t.annualResults} />)}</div>}
      </> : null}
    </>}
    {!focused ? <ChildTuition key={`tuition:${schoolId}:${studentId}`} studentId={studentId} studentName={`${child.firstName} ${child.lastName}`} /> : null}
    {!resultsOnly ? <ChildJourneys key={`${schoolId}:${studentId}:${selectedYearId}`} schoolId={schoolId} studentId={studentId} yearId={selectedYearId} /> : null}
  </div>;
}
