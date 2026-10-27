'use client';
import { useTranslations } from 'next-intl';

import { useQuery } from '@tanstack/react-query';
import { useDomainText } from '@/i18n/use-domain-text';
import { useState } from 'react';
import { InlineFeedback, Modal, StatusBadge, Pagination } from '@/components/academic/ui';
import { Snapshot } from './publication-snapshot';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { gradesApi } from '@/lib/frontend/grades/api';
import { useGradeCopy } from '@/i18n/use-domain-copy';
import { gradeKeys } from '@/lib/frontend/grades/queries';
import type { ResultType } from '@/lib/frontend/grades/types';
import { ResultActions } from './result-actions';

export interface ResultLabels {
  student: (id: string) => string;
  year: (id: string) => string;
  period: (id: string | null) => string;
  klass: (id: string) => string;
  subject: (id: string | null) => string;
}

export function ResultDetail({ schoolId, selected, canAdminister, labels, onClose }: {
  schoolId: string;
  selected: { id: string; type: ResultType } | null;
  canAdminister: boolean;
  labels: ResultLabels;
  onClose: () => void;
}) {
  const ui = useTranslations('learningUi');
  const text = useDomainText();
  const t = useGradeCopy();
  const experience = useTranslations('gradesExperience');
  const [snapshot,setSnapshot]=useState<string>();
  const [notice, setNotice] = useState<string>();
  const [historyPaging, setHistoryPaging] = useState({ key: '', page: 1 });
  const selectionKey = `${schoolId}:${selected?.type}:${selected?.id}`;
  const page = historyPaging.key === selectionKey ? historyPaging.page : 1;
  const query = useQuery({ queryKey: [...gradeKeys.resultDetail(schoolId, selected?.type ?? 'SUBJECT', selected?.id ?? 'none'), page], queryFn: () => gradesApi.result(selected!.type, selected!.id, page), enabled: !!selected });
  const result = query.data;
  return <Modal open={!!selected} title={t.resultDetail} description={text("Calculated and finalized describe the working result. Only publications are visible to Parents; revisions preserve previous snapshots.")} onClose={onClose}>
    {query.isPending ? <InlineLoading label={t.loading} /> : query.isError ? <ApiErrorState title={t.resultsUnavailable} description={t.unavailableDescription} onRetry={() => void query.refetch()} /> : result ? <div className="gr-workspace gr-result-detail space-y-5">
      {notice ? <InlineFeedback brand kind="success">{notice}</InlineFeedback> : null}
      <div className="flex items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">{t.resultType}</p><p className="font-semibold">{t.resultTypeLabels[result.resultType]}</p></div><StatusBadge brand status={result.status} label={text(result.status)} /></div>
      <p className="rounded-md border bg-muted p-3 text-sm">{ui('working')}</p><dl className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2"><Detail label={t.student} value={labels.student(result.studentId)} /><Detail label={t.academicYear} value={labels.year(result.academicYearId)} /><Detail label={t.class} value={labels.klass(result.classId)} />{result.academicPeriodId ? <Detail label={t.period} value={labels.period(result.academicPeriodId)} /> : null}{result.subjectId ? <Detail label={t.subject} value={labels.subject(result.subjectId)} /> : null}<Detail label={t.calculatedValue} value={result.value} /><Detail label={t.configurationVersion} value={result.gradingConfigurationVersionId} mono /></dl>
      {canAdminister ? <ResultActions schoolId={schoolId} result={result} onChanged={(message) => { setNotice(message); void query.refetch(); }} /> : null}
      <section aria-label={text("Publication history")} className="space-y-3"><h3 className="font-semibold">{text("Publication history")}</h3>
        {result.publicationHistory ? <><ol className="space-y-3">{result.publicationHistory.data.map((item) => <li key={item.publicationId} className="rounded border p-3"><p className="font-semibold">{experience('snapshot')} · <bdi>{item.publicationVersion}</bdi> · <bdi dir="ltr">{item.value}</bdi></p><button type="button" className="min-h-10 underline" onClick={()=>setSnapshot(item.publicationId)}>{experience('selectSnapshot')}</button>{snapshot===item.publicationId?<Snapshot value={item}/>:null}</li>)}</ol><Pagination {...result.publicationHistory.meta} onPage={(next) => setHistoryPaging({ key: selectionKey, page: next })} /></> : <p>{text("Not published. No publication history exists.")}</p>}
      </section>
    </div> : null}
  </Modal>;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt><dd dir="auto" className={`mt-1 break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd></div>;
}
