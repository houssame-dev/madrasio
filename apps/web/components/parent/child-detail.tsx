'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { selectClassName } from '@/components/academic/ui';
import { useAppContext } from '@/components/app/app-context';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { ApiErrorState, EmptyState, InlineLoading } from '@/components/ui/states';
import { parentPortalCopy as t } from '@/lib/frontend/parent-portal/copy';
import { childAcademicYearsQuery, childPlacementQuery, childResultsQuery, parentBootstrapQuery } from '@/lib/frontend/parent-portal/queries';
import { relatedChildren, type ParentPublishedResult, type ParentResultType } from '@/lib/frontend/parent-portal/types';
import { can } from '@/lib/frontend/permissions';

function ResultsSection({ title, type, rows }: { title: string; type: ParentResultType; rows: ParentPublishedResult[] }) {
  return <section className="rounded-lg border bg-card p-5" aria-labelledby={`${type.toLowerCase()}-results-heading`}>
    <h2 id={`${type.toLowerCase()}-results-heading`} className="text-lg font-semibold">{title}</h2>
    {rows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t.noPublishedResults}</p> : <ul className="mt-3 divide-y">
      {rows.map((result) => <li key={result.publicationId} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:gap-4">
        <div><p className="font-medium">{type === 'SUBJECT' ? result.subject?.name : type === 'PERIOD' ? result.academicPeriod?.name : result.academicYear.name}</p><p className="text-sm text-muted-foreground">{result.class.name}{result.academicPeriod ? ` · ${result.academicPeriod.name}` : ''}</p></div>
        <div className="sm:text-end"><p className="font-semibold tabular-nums">{result.value}</p><p className="text-xs text-muted-foreground">{t.publishedRevision} {result.publicationVersion}</p></div>
      </li>)}
    </ul>}
  </section>;
}

export function ChildDetail({ studentId, academicYearId }: { studentId: string; academicYearId?: string }) {
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
  const subjectResults = useQuery({ ...childResultsQuery(schoolId ?? 'no-school', studentId, selectedYearId, 'SUBJECT'), enabled: academicEnabled });
  const periodResults = useQuery({ ...childResultsQuery(schoolId ?? 'no-school', studentId, selectedYearId, 'PERIOD'), enabled: academicEnabled });
  const annualResults = useQuery({ ...childResultsQuery(schoolId ?? 'no-school', studentId, selectedYearId, 'ANNUAL'), enabled: academicEnabled });

  if (!allowed || !schoolId) return <AccessDeniedWithReturn />;
  if (profiles.isPending) return <InlineLoading label={t.childrenLoading} />;
  if (profiles.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => void profiles.refetch()} />;
  if (!child) return <EmptyState title={t.childUnavailable} description={t.childUnavailableDescription} action={<Link className="text-sm font-medium underline underline-offset-4" href="/children">{t.backToChildren}</Link>} />;
  const academicError = placement.isError || subjectResults.isError || periodResults.isError || annualResults.isError;
  return <div className="mx-auto max-w-5xl space-y-6"><Link href="/children" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="size-4" aria-hidden="true" />{t.backToChildren}</Link>
    <header><h1 className="text-2xl font-semibold tracking-tight">{child.firstName} {child.lastName}</h1><p className="mt-1 text-sm text-muted-foreground">{t.studentCode}: {child.studentCode ?? t.unknown}</p></header>
    <section className="rounded-lg border bg-card p-5" aria-labelledby="child-overview-heading"><div className="flex items-center gap-2"><GraduationCap className="size-5 text-muted-foreground" aria-hidden="true" /><h2 id="child-overview-heading" className="text-lg font-semibold">{t.overview}</h2></div><p className="mt-3 text-sm text-muted-foreground">{t.noManagement}</p></section>
    {years.isPending ? <InlineLoading label={t.childrenLoading} /> : years.isError ? <ApiErrorState title={t.academicDataUnavailable} description={t.academicDataUnavailableDescription} onRetry={() => void years.refetch()} /> : eligibleYears.length === 0 ? <EmptyState title={t.noAcademicYears} /> : <>
      <form method="get" className="rounded-lg border bg-card p-5"><label htmlFor="academicYearId" className="mb-2 block text-sm font-medium">{t.academicYear}</label><div className="flex flex-col gap-3 sm:flex-row"><select id="academicYearId" name="academicYearId" className={selectClassName} defaultValue={selectedYearId} required><option value="">{t.chooseAcademicYear}</option>{eligibleYears.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}</select><button type="submit" className="min-h-10 rounded-md border px-4 text-sm font-medium hover:bg-muted">{t.viewAcademicYear}</button></div>{!selectedYearId ? <p className="mt-2 text-sm text-muted-foreground">{t.selectAcademicYear}</p> : null}</form>
      {selectedYearId ? academicError ? <ApiErrorState title={t.academicDataUnavailable} description={t.academicDataUnavailableDescription} onRetry={() => { void placement.refetch(); void subjectResults.refetch(); void periodResults.refetch(); void annualResults.refetch(); }} /> : placement.isPending || subjectResults.isPending || periodResults.isPending || annualResults.isPending ? <InlineLoading label={t.childrenLoading} /> : <>
        <section id="placement" className="rounded-lg border bg-card p-5" aria-labelledby="placement-heading"><h2 id="placement-heading" className="text-lg font-semibold">{t.academicPlacement}</h2>{placement.data ? <dl className="mt-3 grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">{t.academicYear}</dt><dd className="font-medium">{placement.data.academicYearName}</dd></div><div><dt className="text-sm text-muted-foreground">{t.classLabel}</dt><dd className="font-medium">{placement.data.className}</dd></div><div><dt className="text-sm text-muted-foreground">{t.stageLabel}</dt><dd className="font-medium">{placement.data.stageName}</dd></div><div><dt className="text-sm text-muted-foreground">{t.levelLabel}</dt><dd className="font-medium">{placement.data.levelName}</dd></div>{placement.data.trackName ? <div><dt className="text-sm text-muted-foreground">{t.trackLabel}</dt><dd className="font-medium">{placement.data.trackName}</dd></div> : null}</dl> : <p className="mt-3 text-sm text-muted-foreground">{t.placementUnavailable}</p>}</section>
        <div id="results" className="grid gap-4 lg:grid-cols-3"><ResultsSection title={t.subjectResults} type="SUBJECT" rows={subjectResults.data?.data ?? []} /><ResultsSection title={t.periodResults} type="PERIOD" rows={periodResults.data?.data ?? []} /><ResultsSection title={t.annualResults} type="ANNUAL" rows={annualResults.data?.data ?? []} /></div>
      </> : null}
    </>}
    <section id="homework" className="rounded-lg border bg-card p-5"><div className="flex items-center gap-2"><BookOpen className="size-5 text-muted-foreground" aria-hidden="true" /><h2 className="text-lg font-semibold">{t.homework}</h2></div><p className="mt-3 font-medium">{t.homeworkUnavailable}</p><p className="mt-1 text-sm text-muted-foreground">{t.homeworkExplanation}</p></section>
  </div>;
}
