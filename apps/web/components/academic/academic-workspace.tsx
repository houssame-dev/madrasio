'use client';
import { BookOpen, CalendarDays, Layers, School } from 'lucide-react';
import { useTranslations } from 'next-intl';
import './planning.css';

import { cn } from '@school/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { AccessDeniedWithReturn } from '@/components/app/route-access';
import { useAppContext } from '@/components/app/app-context';
import { useAcademicCopy } from '@/i18n/use-domain-copy';
import { can } from '@/lib/frontend/permissions';
import { ClassesSection } from './classes-section';
import { CurriculaSection } from './curricula-section';
import { StructureSection } from './structure-section';
import { SubjectsSection } from './subjects-section';
import { TracksSection } from './tracks-section';
import { YearsSection } from './years-section';
import { ManagementGuide, ManagementPageHeader } from './ui';

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
  const t = useAcademicCopy();
  const copy = useTranslations('academicPlanning');
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
  const area = section === 'tracks' ? 'structure' : section === 'subjects' ? 'curricula' : section;
  const cards = [{id:'years',icon:CalendarDays},{id:'structure',icon:Layers},{id:'curricula',icon:BookOpen},{id:'classes',icon:School}] as const;
  const yearId = searchParams.get('yearId') || undefined;
  const nested = (key:string) => searchParams.get(key) || undefined;
  return <div className="academic-planning space-y-6" key={`${context.user.id}:${shared.schoolId}`}><ManagementPageHeader title={copy('title')} description={copy('description')} readOnly={!canManage} /><nav aria-label={t.academicSections} className="ap-areas">{cards.map(({id,icon:Icon}) => <button key={id} type="button" aria-current={area===id?'page':undefined} className={cn('ap-area',area===id&&'ap-area-active')} onClick={()=>updateUrl({section:id,page:1,status:undefined,search:undefined})}><span className="ap-area-icon"><Icon aria-hidden="true" /></span><span><strong>{copy(id)}</strong><small>{copy(`${id}Hint`)}</small></span></button>)}</nav>
    {area==='structure'?<nav className="ap-subnav" aria-label={copy('structure')}>{(['structure','tracks'] as const).map(id=><button key={id} aria-current={section===id?'page':undefined} onClick={()=>updateUrl({section:id,page:1,status:undefined,search:undefined})}>{id==='structure'?copy('stagesLevels'):t.sections.tracks}</button>)}</nav>:null}
    {area==='curricula'?<nav className="ap-subnav" aria-label={copy('curricula')}>{(['subjects','curricula'] as const).map(id=><button key={id} aria-current={section===id?'page':undefined} onClick={()=>updateUrl({section:id,page:1,status:undefined,search:undefined})}>{t.sections[id]}</button>)}</nav>:null}
    <ManagementGuide area={section} />
    {section === 'years' ? <YearsSection {...shared} search={search} onSearch={value=>updateUrl({search:value,page:1})} yearId={yearId} onSelectYear={value=>updateUrl({yearId:value})} /> : null}
    {section === 'structure' ? <StructureSection schoolId={shared.schoolId} canManage={canManage} page={page} onPage={shared.onPage} stageId={nested('stageId')} onSelectStage={value=>updateUrl({stageId:value})} /> : null}
    {section === 'tracks' ? <TracksSection {...shared} /> : null}
    {section === 'subjects' ? <SubjectsSection {...shared} search={search} onSearch={(nextSearch) => updateUrl({ search: nextSearch, page: 1 })} /> : null}
    {section === 'curricula' ? <CurriculaSection {...shared} curriculumId={nested('curriculumId')} versionId={nested('versionId')} onSelectCurriculum={value=>updateUrl({curriculumId:value,versionId:undefined})} onSelectVersion={value=>updateUrl({versionId:value})} search={search} onSearch={(nextSearch) => updateUrl({ search: nextSearch, page: 1 })} /> : null}
    {section === 'classes' ? <ClassesSection {...shared} yearId={yearId} onSelectYear={value=>updateUrl({yearId:value,page:1})} search={search} onSearch={(nextSearch) => updateUrl({ search: nextSearch, page: 1 })} /> : null}
  </div>;
}
