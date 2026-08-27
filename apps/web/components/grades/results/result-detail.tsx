'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { InlineFeedback, Modal, StatusBadge } from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { gradesApi } from '@/lib/frontend/grades/api';
import { gradeCopy as t } from '@/lib/frontend/grades/copy';
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
  const [notice, setNotice] = useState<string>();
  const query = useQuery({ queryKey: gradeKeys.resultDetail(schoolId, selected?.type ?? 'SUBJECT', selected?.id ?? 'none'), queryFn: () => gradesApi.result(selected!.type, selected!.id), enabled: !!selected });
  const result = query.data;
  return <Modal open={!!selected} title={t.resultDetail} description={t.publicationHistoryUnavailable} onClose={onClose}>
    {query.isPending ? <InlineLoading label={t.loading} /> : query.isError ? <ApiErrorState title={t.resultsUnavailable} description={t.unavailableDescription} onRetry={() => void query.refetch()} /> : result ? <div className="space-y-5">
      {notice ? <InlineFeedback kind="success">{notice}</InlineFeedback> : null}
      <div className="flex items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">{t.resultType}</p><p className="font-semibold">{t.resultTypeLabels[result.resultType]}</p></div><StatusBadge status={result.status} /></div>
      <dl className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"><Detail label={t.student} value={labels.student(result.studentId)} /><Detail label={t.academicYear} value={labels.year(result.academicYearId)} /><Detail label={t.class} value={labels.klass(result.classId)} />{result.academicPeriodId ? <Detail label={t.period} value={labels.period(result.academicPeriodId)} /> : null}{result.subjectId ? <Detail label={t.subject} value={labels.subject(result.subjectId)} /> : null}<Detail label={t.calculatedValue} value={result.value} /><Detail label={t.configurationVersion} value={result.gradingConfigurationVersionId} mono /></dl>
      {canAdminister ? <ResultActions schoolId={schoolId} result={result} onChanged={(message) => { setNotice(message); void query.refetch(); }} /> : null}
    </div> : null}
  </Modal>;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt><dd className={`mt-1 break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd></div>;
}
