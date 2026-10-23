'use client';
import { useSuccessFeedback } from '@/lib/frontend/use-success-feedback';
import { useDomainText } from '@/i18n/use-domain-text';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ApiErrorState } from '@/components/ui/states';
import { academicApi } from '@/lib/frontend/academic/api';
import { useAcademicCopy } from '@/i18n/use-domain-copy';
import { academicKeys } from '@/lib/frontend/academic/queries';
import type { LevelDto, OrderedStructureDto } from '@/lib/frontend/academic/types';
import { LevelForm, OrderedStructureForm } from './forms';
import { activeTransitions, LifecycleActions } from './lifecycle-actions';
import { EmptyTableRow, InlineFeedback, Modal, Pagination, SectionHeader, StatusBadge, TableShell, selectClassName } from './ui';

export function StructureSection({ schoolId, canManage, page, onPage }: { schoolId: string; canManage: boolean; page: number; onPage: (page: number) => void }) {
  const text = useDomainText();
  const t = useAcademicCopy();
  const queryClient = useQueryClient();
  const [levelPage, setLevelPage] = useState(1);
  const [stageFilter, setStageFilter] = useState<string>();
  const [stageEditing, setStageEditing] = useState<OrderedStructureDto | null | undefined>();
  const [levelEditing, setLevelEditing] = useState<LevelDto | null | undefined>();
  const [notice, setNotice] = useSuccessFeedback();
  const stageParams = { page, pageSize: 20 };
  const levelParams = { page: levelPage, pageSize: 20, stageId: stageFilter };
  const stages = useQuery({ queryKey: academicKeys.list(schoolId, 'stages', stageParams), queryFn: () => academicApi.stages(stageParams) });
  const allStages = useQuery({ queryKey: academicKeys.selectors(schoolId, 'stages'), queryFn: academicApi.allStages });
  const levels = useQuery({ queryKey: academicKeys.list(schoolId, 'levels', levelParams), queryFn: () => academicApi.levels(levelParams) });
  const stageName = (id: string) => allStages.data?.find((stage) => stage.id === id)?.name ?? id;
  const invalidate = async (resource: 'stages' | 'levels') => {
    await queryClient.invalidateQueries({ queryKey: ['academic', schoolId, resource] });
    await queryClient.invalidateQueries({ queryKey: academicKeys.selectors(schoolId, resource) });
    if (resource === 'stages') await queryClient.invalidateQueries({ queryKey: academicKeys.selectors(schoolId, 'stages') });
    setNotice(t.mutationSuccess);
  };
  return <div className="space-y-8">
    {notice ? <InlineFeedback brand kind="success">{notice}</InlineFeedback> : null}
    <section className="space-y-4"><SectionHeader title={t.sections.structure} description={text("Stages organize Levels; each Level keeps its authoritative Stage relationship.")} action={canManage ? <Button type="button" onClick={() => setStageEditing(null)}><Plus className="size-4" aria-hidden="true" />{t.createStage}</Button> : undefined} />{stages.isError ? <ApiErrorState title={t.listError} onRetry={() => void stages.refetch()} /> : <><TableShell responsive headers={[t.sequence, t.name, t.status, t.actions]} loading={stages.isPending}>{stages.data?.data.length === 0 ? <EmptyTableRow columns={4} /> : stages.data?.data.map((stage) => <tr key={stage.id}><td dir="auto" className="px-4 py-3">{stage.sequence}</td><td dir="auto" className="px-4 py-3 font-medium">{stage.name}</td><td dir="auto" className="px-4 py-3"><StatusBadge brand status={stage.status} label={text(stage.status)} /></td><td dir="auto" className="px-4 py-3"><div className="flex flex-wrap justify-end gap-1">{canManage ? <><Button type="button" variant="ghost" size="sm" aria-label={`${t.edit} ${stage.name}`} onClick={() => setStageEditing(stage)}><Pencil className="size-4" aria-hidden="true" /></Button><LifecycleActions resourceName={stage.name} path={`/api/v1/stages/${stage.id}`} transitions={activeTransitions(stage.status)} onSaved={() => invalidate('stages')} /></> : null}</div></td></tr>)}</TableShell>{stages.data ? <Pagination {...stages.data.meta} onPage={onPage} /> : null}</>}</section>
    <section className="space-y-4"><SectionHeader title={text("Levels")} description={text("Filter and manage Levels through their existing Stage relationship.")} action={canManage ? <Button type="button" disabled={!allStages.data?.length} onClick={() => setLevelEditing(null)}><Plus className="size-4" aria-hidden="true" />{t.createLevel}</Button> : undefined} /><label className="block max-w-xs"><span className="mb-1.5 block text-sm font-medium">{t.stage}</span><select aria-label={t.stage} className={selectClassName} value={stageFilter ?? ''} onChange={(event) => { setStageFilter(event.target.value || undefined); setLevelPage(1); }}><option value="">{text("All stages")}</option>{allStages.data?.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>{levels.isError ? <ApiErrorState title={t.listError} onRetry={() => void levels.refetch()} /> : <><TableShell responsive headers={[t.sequence, t.name, t.stage, t.status, t.actions]} loading={levels.isPending || allStages.isPending}>{levels.data?.data.length === 0 ? <EmptyTableRow columns={5} /> : levels.data?.data.map((level) => <tr key={level.id}><td dir="auto" className="px-4 py-3">{level.sequence}</td><td dir="auto" className="px-4 py-3 font-medium">{level.name}</td><td dir="auto" className="px-4 py-3">{stageName(level.stageId)}</td><td dir="auto" className="px-4 py-3"><StatusBadge brand status={level.status} label={text(level.status)} /></td><td dir="auto" className="px-4 py-3"><div className="flex flex-wrap justify-end gap-1">{canManage ? <><Button type="button" variant="ghost" size="sm" aria-label={`${t.edit} ${level.name}`} onClick={() => setLevelEditing(level)}><Pencil className="size-4" aria-hidden="true" /></Button><LifecycleActions resourceName={level.name} path={`/api/v1/levels/${level.id}`} transitions={activeTransitions(level.status)} onSaved={() => invalidate('levels')} /></> : null}</div></td></tr>)}</TableShell>{levels.data ? <Pagination {...levels.data.meta} onPage={setLevelPage} /> : null}</>}</section>
    <Modal open={stageEditing !== undefined} title={stageEditing ? t.editStage : t.createStage} onClose={() => setStageEditing(undefined)}>{stageEditing !== undefined ? <OrderedStructureForm resource="stages" initial={stageEditing ?? undefined} onCancel={() => setStageEditing(undefined)} onSaved={async () => { await invalidate('stages'); setStageEditing(undefined); }} /> : null}</Modal>
    <Modal open={levelEditing !== undefined} title={levelEditing ? t.editLevel : t.createLevel} onClose={() => setLevelEditing(undefined)}>{levelEditing !== undefined && allStages.data ? <LevelForm stages={allStages.data} initial={levelEditing ?? undefined} onCancel={() => setLevelEditing(undefined)} onSaved={async () => { await invalidate('levels'); setLevelEditing(undefined); }} /> : null}</Modal>
  </div>;
}
