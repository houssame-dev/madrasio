'use client';

import { cn } from '@school/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { academicCopy as t } from '@/lib/frontend/academic/copy';
import { can } from '@/lib/frontend/permissions';
import { ClassesSection } from './classes-section';
import { CurriculaSection } from './curricula-section';
import { StructureSection } from './structure-section';
import { SubjectsSection } from './subjects-section';
import { TracksSection } from './tracks-section';
import { YearsSection } from './years-section';
import { ManagementPageHeader } from './ui';

const sections = ['years', 'structure', 'tracks', 'subjects', 'curricula', 'classes'] as const;
type Section = (typeof sections)[number];
const allowedStatuses: Record<Section, readonly string[]> = {
  years: ['PLANNED', 'ACTIVE', 'CLOSED', 'ARCHIVED'],
  structure: [], tracks: ['ACTIVE', 'INACTIVE'], subjects: ['ACTIVE', 'INACTIVE'],
  curricula: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], classes: ['ACTIVE', 'CLOSED', 'ARCHIVED'],
};

function isSection(value: string | null): value is Section {
  return value != null && (sections as readonly string[]).includes(value);
}

export function AcademicWorkspace() {
  const context = useAppContext();
  const role = context.currentSchool?.role;
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const section: Section = isSection(searchParams.get('section')) ? searchParams.get('section') as Section : 'years';
  const pageValue = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const rawStatus = searchParams.get('status');
  const status = rawStatus && allowedStatuses[section].includes(rawStatus) ? rawStatus : undefined;
  const search = searchParams.get('search') || undefined;
  const updateUrl = useCallback((updates: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);
  if (!role || !can(role, 'academic_structure.read')) return <AccessDeniedWithReturn />;
  const canManage = can(role, 'academic_structure.manage');
  const shared = { schoolId: context.currentSchool!.id, canManage, page, status, onPage: (nextPage: number) => updateUrl({ page: nextPage }), onStatus: (nextStatus?: string) => updateUrl({ status: nextStatus, page: 1 }) };
  return <div className="mx-auto max-w-[100rem] space-y-6"><ManagementPageHeader readOnly={!canManage} /><nav aria-label={t.academicSections} className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">{sections.map((item) => <button key={item} type="button" aria-current={section === item ? 'page' : undefined} className={cn('shrink-0 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground', section === item && 'bg-accent text-accent-foreground')} onClick={() => updateUrl({ section: item, page: 1, status: undefined, search: undefined })}>{t.sections[item]}</button>)}</nav>
    {section === 'years' ? <YearsSection {...shared} /> : null}
    {section === 'structure' ? <StructureSection schoolId={shared.schoolId} canManage={canManage} page={page} onPage={shared.onPage} /> : null}
    {section === 'tracks' ? <TracksSection {...shared} /> : null}
    {section === 'subjects' ? <SubjectsSection {...shared} search={search} onSearch={(nextSearch) => updateUrl({ search: nextSearch, page: 1 })} /> : null}
    {section === 'curricula' ? <CurriculaSection {...shared} /> : null}
    {section === 'classes' ? <ClassesSection {...shared} /> : null}
  </div>;
}
