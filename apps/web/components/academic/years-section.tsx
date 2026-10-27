'use client';
import { useTranslations } from 'next-intl';
import { SearchInput } from '@/components/ui/search-input';
import { useSuccessFeedback } from '@/lib/frontend/use-success-feedback';
import { useDomainText } from '@/i18n/use-domain-text';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@school/ui';
import { ApiErrorState } from '@/components/ui/states';
import { academicApi } from '@/lib/frontend/academic/api';
import { useAcademicCopy } from '@/i18n/use-domain-copy';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { AcademicPeriodDto, AcademicYearDto } from '@/lib/frontend/academic/types';
import { PeriodForm, YearForm } from './forms';
import { LifecycleActions, periodTransitions, yearTransitions } from './lifecycle-actions';
import { EmptyTableRow, InlineFeedback, Modal, Pagination, SectionHeader, StatusBadge, TableShell, selectClassName } from './ui';

export function YearsSection({ schoolId, canManage, page, status, onPage, onStatus, yearId, onSelectYear, search, onSearch = () => {} }:  { schoolId: string; canManage: boolean; yearId?:string; onSelectYear?:(id?:string)=>void; search?:string; onSearch?:(value?:string)=>void; page: number; status?: string; onPage: (page: number) => void; onStatus: (status?: string) => void }) {
  const text = useDomainText();
  const t = useAcademicCopy();
  const copy=useTranslations('academicPlanning');
  const queryClient = useQueryClient();
  const params = { page, pageSize: 20, status, search };
  const years = useQuery({ queryKey: academicKeys.list(schoolId, 'years', params), queryFn: () => academicApi.years(params) });
  const [editing, setEditing] = useState<AcademicYearDto | null | undefined>();
  const [localYearId, setLocalYearId] = useState<string>();
  const selectedYearId = onSelectYear ? yearId : localYearId;
  const setSelectedYearId = onSelectYear ?? setLocalYearId;
  const selected = useQuery({queryKey:academicKeys.selectors(schoolId,`year-${selectedYearId}`),queryFn:()=>academicApi.year(selectedYearId!),enabled:!!selectedYearId});
  const [notice, setNotice] = useSuccessFeedback();
  const selectedYear = useMemo(() => years.data?.data.find((year) => year.id === selectedYearId) ?? selected.data, [selectedYearId, years.data, selected.data]);
  const invalidateYears = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['academic', schoolId, 'years'] }),
      queryClient.invalidateQueries({ queryKey: academicKeys.selectors(schoolId, 'years') }),
      queryClient.invalidateQueries({queryKey:academicKeys.selectors(schoolId,`year-${selectedYearId}`)}),
    ]);
    setNotice(t.mutationSuccess);
  };
  return <div className="space-y-5">
    <SectionHeader title={t.sections.years} description={copy('yearsDescription')} action={canManage ? <Button type="button" onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden="true" />{t.createYear}</Button> : undefined} />
    {notice ? <InlineFeedback brand kind="success">{notice}</InlineFeedback> : null}
    <div className="ap-split ap-years"><section className="ap-panel space-y-4"><h3>{t.sections.years}</h3><SearchInput id="years-search" label={t.search} value={search} onSearch={onSearch} busy={years.isFetching} /><label className="block max-w-xs text-sm"><span className="mb-1.5 block text-sm font-medium">{t.filterStatus}</span><select aria-label={t.filterStatus} value={status ?? ''} className={selectClassName} onChange={(event) => onStatus(event.target.value || undefined)}><option value="">{t.allStatuses}</option>{['PLANNED', 'ACTIVE', 'CLOSED', 'ARCHIVED'].map((value) => <option key={value} value={value}>{text(value)}</option>)}</select></label>
    {years.isError ? <ApiErrorState title={t.listError} onRetry={() => void years.refetch()} /> : <>
      <TableShell responsive headers={[t.name, `${t.startDate} / ${t.endDate}`, t.status, t.actions]} loading={years.isPending}>
        {years.data?.data.length === 0 ? <EmptyTableRow columns={4} /> : years.data?.data.map((year) => <tr key={year.id}><td dir="auto" className="px-4 py-3 font-medium">{year.name}</td><td dir="auto" className="px-4 py-3 text-muted-foreground">{year.startDate}<br />{year.endDate}</td><td dir="auto" className="px-4 py-3"><StatusBadge brand status={year.status} label={text(year.status)} /></td><td dir="auto" className="px-4 py-3"><div className="flex flex-wrap justify-end gap-1"><Button type="button" size="sm" variant="outline" onClick={() => setSelectedYearId(year.id)}>{t.managePeriods}</Button>{canManage ? <><Button type="button" size="sm" variant="ghost" aria-label={`${t.edit} ${year.name}`} onClick={() => setEditing(year)}><Pencil className="size-4" aria-hidden="true" /></Button><LifecycleActions resourceName={year.name} path={`/api/v1/academic-years/${year.id}`} transitions={yearTransitions(year.status)} onSaved={invalidateYears} /></> : null}</div></td></tr>)}
      </TableShell>
      {years.data ? <Pagination {...years.data.meta} onPage={onPage} /> : null}
    </>}
    </section>{selectedYear ? <PeriodsPanel key={selectedYear.id} schoolId={schoolId} year={selectedYear} canManage={canManage} onClose={() => setSelectedYearId(undefined)} /> : selected.isError ? <ApiErrorState title={t.listError} onRetry={()=>void selected.refetch()} /> : <aside className="ap-panel ap-placeholder"><p>{copy('selectYear')}</p></aside>}</div>
    <Modal open={editing !== undefined} title={editing ? t.editYear : t.createYear} description={editing ? undefined : t.description} onClose={() => setEditing(undefined)}>{editing !== undefined ? <YearForm initial={editing ?? undefined} onCancel={() => setEditing(undefined)} onSaved={async () => { await invalidateYears(); setEditing(undefined); }} /> : null}</Modal>
  </div>;
}

function PeriodsPanel({ schoolId, year, canManage, onClose }: { schoolId: string; year: AcademicYearDto; canManage: boolean; onClose: () => void }) {
  const text = useDomainText();
  const t = useAcademicCopy();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AcademicPeriodDto | null | undefined>();
  const [notice, setNotice] = useSuccessFeedback();
  const params = { page, pageSize: 20 };
  const periods = useQuery({ queryKey: academicKeys.periods(schoolId, year.id, params), queryFn: () => academicApi.periods(year.id, params) });
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: ['academic', schoolId, 'periods', year.id] }); setNotice(t.mutationSuccess); };
  return <section className="ap-panel space-y-4"><SectionHeader title={t.periodsFor(year.name)} description={`${year.startDate} — ${year.endDate}`} action={<div className="flex flex-wrap gap-2">{canManage ? <Button type="button" size="sm" onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden="true" />{t.createPeriod}</Button> : null}<Button type="button" size="sm" variant="outline" onClick={onClose}>{t.cancel}</Button></div>} />{notice ? <InlineFeedback brand kind="success">{notice}</InlineFeedback> : null}{periods.isError ? <ApiErrorState title={t.listError} onRetry={() => void periods.refetch()} /> : <><TableShell responsive headers={[t.sequence, t.name, `${t.startDate} / ${t.endDate}`, t.status, t.actions]} loading={periods.isPending}>{periods.data?.data.length === 0 ? <EmptyTableRow columns={5} /> : periods.data?.data.map((period) => <tr key={period.id}><td dir="auto" className="px-4 py-3">{period.sequence}</td><td dir="auto" className="px-4 py-3 font-medium">{period.name}</td><td dir="auto" className="px-4 py-3 text-muted-foreground">{period.startDate}<br />{period.endDate}</td><td dir="auto" className="px-4 py-3"><StatusBadge brand status={period.status} label={text(period.status)} /></td><td dir="auto" className="px-4 py-3"><div className="flex flex-wrap justify-end gap-1">{canManage ? <><Button type="button" size="sm" variant="ghost" aria-label={`${t.edit} ${period.name}`} onClick={() => setEditing(period)}><Pencil className="size-4" aria-hidden="true" /></Button><LifecycleActions resourceName={period.name} path={`/api/v1/academic-periods/${period.id}`} transitions={periodTransitions(period.status)} onSaved={invalidate} /></> : null}</div></td></tr>)}</TableShell>{periods.data ? <Pagination {...periods.data.meta} onPage={setPage} /> : null}</>}
    <Modal open={editing !== undefined} title={editing ? t.editPeriod : t.createPeriod} description={`${year.startDate} — ${year.endDate}`} onClose={() => setEditing(undefined)}>{editing !== undefined ? <PeriodForm year={year} initial={editing ?? undefined} onCancel={() => setEditing(undefined)} onSaved={async () => { await invalidate(); setEditing(undefined); }} /> : null}</Modal>
  </section>;
}
