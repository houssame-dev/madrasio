'use client';
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Button } from '@school/ui';
import {
  Modal,
  Pagination,
  InlineFeedback,
  selectClassName,
  TableShell,
} from '@/components/academic/ui';
import { ApiErrorState, InlineLoading } from '@/components/ui/states';
import { useDomainText } from '@/i18n/use-domain-text';
import { gradeErrorCodeMessage } from '@/lib/frontend/grades/errors';
import { apiRequest } from '@/lib/frontend/api-client';
import { listAllResource } from '@/lib/frontend/academic/api';
import { useGradeCopy } from '@/i18n/use-domain-copy';
import type {
  AcademicYearDto,
  ClassDto,
  AcademicPeriodDto,
  SubjectDto,
} from '@/lib/frontend/academic/types';
import type { GradebookDto, ResultDto, ResultType } from '@/lib/frontend/grades/types';
import type {
  ResultBatchScope,
  ResultBatchCommand,
} from '@/lib/modules/grades/domain/result-batch';
import type { BatchOutcome } from '@/lib/modules/grades/application/result-batch';

type Operation = ResultBatchCommand['operation'];
interface Candidate {
  student: { id: string; firstName: string; lastName: string; studentCode: string | null };
  result: ResultDto | null;
  expectedToken: string;
  publicationId: string | null;
  eligible: boolean;
  reason: string;
}
interface Preview {
  data: Candidate[];
  meta: { page: number; pageSize: number; total: number };
  limit: number;
}
export function ResultBatchPanel({
  schoolId,
  resultType,
  operation,
  years,
  classes,
  gradebooks,
  subjects,
}: {
  schoolId: string;
  resultType: ResultType;
  operation: Operation;
  years: AcademicYearDto[];
  classes: ClassDto[];
  gradebooks: GradebookDto[];
  subjects?: SubjectDto[];
}) {
  const t = useGradeCopy(),
    ui = useTranslations('gradesExperience');
  const [year, setYear] = useState(''),
    [klass, setClass] = useState(''),
    [period, setPeriod] = useState(''),
    [gradebook, setGradebook] = useState('');
  const periods = useQuery({
    queryKey: ['result-batch-periods', schoolId, year],
    queryFn: () => listAllResource<AcademicPeriodDto>(`/api/v1/academic-years/${year}/periods`),
    enabled: !!year,
  });
  const valid =
    !!year &&
    !!klass &&
    (resultType === 'ANNUAL' || !!period) &&
    (resultType !== 'SUBJECT' || !!gradebook);
  const scope: ResultBatchScope = {
    resultType,
    academicYearId: year,
    classId: klass,
    ...(resultType !== 'ANNUAL' ? { academicPeriodId: period } : {}),
    ...(resultType === 'SUBJECT' ? { gradebookId: gradebook } : {}),
  };
  return (
    <section className="gr-batch space-y-5">
      <p className="gr-notice">{ui('limit')}</p>
      <p className="text-sm text-muted-foreground">
        {ui(operation === 'PUBLISH' ? 'initialOnly' : 'noAutomatic')}
      </p>
      <fieldset className="gr-card gr-context">
        <legend>{ui('scope')}</legend>
        <label>
          {t.academicYear}
          <select
            className={selectClassName}
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setClass('');
              setPeriod('');
              setGradebook('');
            }}
          >
            <option value="">{ui('choose')}</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.class}
          <select
            className={selectClassName}
            value={klass}
            onChange={(e) => {
              setClass(e.target.value);
              setGradebook('');
            }}
            disabled={!year}
          >
            <option value="">{ui('choose')}</option>
            {classes
              .filter((c) => c.academicYearId === year)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        {resultType !== 'ANNUAL' ? (
          <label>
            {t.period}
            <select
              className={selectClassName}
              value={period}
              disabled={!year || periods.isPending}
              onChange={(e) => {
                setPeriod(e.target.value);
                setGradebook('');
              }}
            >
              <option value="">{ui('choose')}</option>
              {periods.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {resultType === 'SUBJECT' ? (
          <label>
            {t.gradebooks}
            <select
              className={selectClassName}
              value={gradebook}
              onChange={(e) => setGradebook(e.target.value)}
              disabled={!klass || !period}
            >
              <option value="">{ui('choose')}</option>
              {gradebooks
                .filter(
                  (g) =>
                    g.classId === klass &&
                    g.academicYearId === year &&
                    g.academicPeriodId === period,
                )
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {[g.name, subjects?.find((s) => s.id === g.subjectId)?.name, g.id]
                      .filter(Boolean)
                      .join(' · ')}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
      </fieldset>
      {periods.isError ? (
        <ApiErrorState title={t.resultsUnavailable} onRetry={() => void periods.refetch()} />
      ) : null}
      {valid ? (
        <BatchSelection
          key={JSON.stringify({ schoolId, scope, operation })}
          schoolId={schoolId}
          scope={scope}
          operation={operation}
          contextLabel={[
            years.find((y) => y.id === year)?.name,
            classes.find((c) => c.id === klass)?.name,
            periods.data?.find((p) => p.id === period)?.name,
            ...(resultType === 'SUBJECT'
              ? [
                  gradebooks.find((g) => g.id === gradebook)?.name,
                  subjects?.find(
                    (s) => s.id === gradebooks.find((g) => g.id === gradebook)?.subjectId,
                  )?.name,
                  gradebook,
                ]
              : []),
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      ) : null}
    </section>
  );
}
function BatchSelection({
  schoolId,
  scope,
  operation,
  contextLabel,
}: {
  schoolId: string;
  scope: ResultBatchScope;
  operation: Operation;
  contextLabel: string;
}) {
  const text = useDomainText();
  const ui = useTranslations('gradesExperience'),
    t = useGradeCopy(),
    client = useQueryClient();
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<string[]>([]),
    [confirm, setConfirm] = useState(false),
    [outcomes, setOutcomes] = useState<BatchOutcome[]>([]);
  const keys = useRef(new Map<string, string>());
  const query = useQuery({
    queryKey: ['result-batch', schoolId, scope, operation, page],
    queryFn: () =>
      apiRequest<{ data: Preview }>(
        `/api/v1/results/batch?${new URLSearchParams({ ...scope, operation, page: String(page) })}`,
      ).then((r) => r.data),
    refetchOnWindowFocus: false,
  });
  const rows = query.data?.data ?? [],
    chosen = rows.filter((r) => selected.includes(r.student.id));
  const mutation = useMutation({
    mutationFn: () => {
      const command: ResultBatchCommand = {
        scope,
        operation,
        confirm: true,
        entries: chosen.map((r) => {
          if (operation === 'PUBLISH' && !keys.current.has(r.student.id))
            keys.current.set(r.student.id, crypto.randomUUID());
          return {
            studentId: r.student.id,
            resultId: r.result?.id ?? null,
            expectedToken: r.expectedToken,
            ...(operation === 'PUBLISH' ? { idempotencyKey: keys.current.get(r.student.id)! } : {}),
          };
        }),
      };
      return apiRequest<{ data: { outcomes: BatchOutcome[] } }>('/api/v1/results/batch', {
        method: 'POST',
        body: JSON.stringify(command),
      });
    },
    retry: false,
    onSuccess: async (response) => {
      setOutcomes(response.data.outcomes);
      setSelected((old) =>
        old.filter(
          (id) =>
            !response.data.outcomes.some((o) => o.studentId === id && o.status === 'COMPLETED'),
        ),
      );
      setConfirm(false);
      await client.invalidateQueries({ queryKey: ['grades', schoolId] });
    },
  });
  const label =
    operation === 'CALCULATE' ? 'calculate' : operation === 'FINALIZE' ? 'finalize' : 'publish';
  if (query.isPending) return <InlineLoading label={t.loading} />;
  if (query.isError)
    return <ApiErrorState title={t.resultsUnavailable} onRetry={() => void query.refetch()} />;
  const completed = new Set(
    outcomes.filter((o) => o.status === 'COMPLETED').map((o) => o.studentId),
  );
  return (
    <div className="space-y-5">
      <dl className="gr-summary">
        <div>
          <dt>{ui('selected')}</dt>
          <dd>{selected.length}</dd>
        </div>
        <div>
          <dt>{ui('eligible')}</dt>
          <dd>{rows.filter((r) => r.eligible && !completed.has(r.student.id)).length}</dd>
        </div>
        <div>
          <dt>{t.resultType}</dt>
          <dd>{t.resultTypeLabels[scope.resultType]}</dd>
        </div>
      </dl>
      <section className="gr-card space-y-4">
        <h3>{ui(label)}</h3>
        <TableShell responsive headers={[t.student, t.calculatedValue, t.status, ui('reason')]}>
          {rows.map((row) => (
            <tr key={row.student.id}>
              <th scope="row" className="p-3 text-start">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(row.student.id)}
                    disabled={!row.eligible || completed.has(row.student.id) || mutation.isPending}
                    aria-label={ui('select', {
                      name: `${row.student.firstName} ${row.student.lastName}`,
                    })}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, row.student.id]
                          : old.filter((id) => id !== row.student.id),
                      )
                    }
                  />
                  <span>
                    <bdi>
                      {row.student.firstName} {row.student.lastName}
                    </bdi>
                    <small className="block text-muted-foreground">
                      <bdi>{row.student.studentCode}</bdi>
                    </small>
                  </span>
                </label>
              </th>
              <td className="p-3">
                <bdi dir="ltr">{row.result?.value ?? '—'}</bdi>
              </td>
              <td className="p-3">
                {row.result
                  ? ui(row.result.status === 'FINALIZED' ? 'finalizedState' : 'CALCULATED')
                  : ui('NOT_CALCULATED')}
              </td>
              <td className="p-3">
                {completed.has(row.student.id) ? ui('COMPLETED') : ui(row.reason as 'READY')}
              </td>
            </tr>
          ))}
        </TableShell>
        <div className="flex flex-wrap gap-3">
          <Button
            className="gr-primary"
            disabled={!selected.length || mutation.isPending}
            onClick={() => setConfirm(true)}
          >
            {ui('review')} ({selected.length})
          </Button>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              setSelected([]);
              setOutcomes([]);
              void query.refetch();
            }}
          >
            {ui('refresh')}
          </Button>
        </div>
        <Pagination
          {...query.data.meta}
          onPage={(p) => {
            setSelected([]);
            setOutcomes([]);
            setPage(p);
          }}
        />
      </section>
      {outcomes.length ? (
        <section className="gr-card space-y-3" aria-live="polite">
          <h3>{ui('outcomes')}</h3>
          <ul>
            {outcomes.map((o) => (
              <li key={o.studentId} className="gr-outcome">
                <bdi>
                  {rows.find((r) => r.student.id === o.studentId)?.student.firstName}{' '}
                  {rows.find((r) => r.student.id === o.studentId)?.student.lastName}
                </bdi>
                <span>{ui(o.status)}</span>
                {o.status !== 'COMPLETED' ? (
                  <p>
                    {text(gradeErrorCodeMessage(o.code))}
                    {o.reason ? <> · {text(o.reason)}</> : null}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {selected.length ? (
            <Button variant="outline" onClick={() => setConfirm(true)}>
              {ui('retry')}
            </Button>
          ) : null}
        </section>
      ) : null}
      <Modal
        open={confirm}
        title={ui('confirm')}
        description={`${ui(label)} · ${contextLabel} · ${t.resultTypeLabels[scope.resultType]} · ${chosen.length}`}
        onClose={() => {
          if (!mutation.isPending) setConfirm(false);
        }}
      >
        <div className="gr-workspace space-y-4">
          <p>{ui('limit')}</p>
          <p>{ui(operation === 'PUBLISH' ? 'initialOnly' : 'noAutomatic')}</p>
          <ul className="divide-y">
            {chosen.map((r) => (
              <li className="py-2" key={r.student.id}>
                <bdi>
                  {r.student.firstName} {r.student.lastName}
                </bdi>{' '}
                · <bdi dir="ltr">{r.result?.value ?? '—'}</bdi>
              </li>
            ))}
          </ul>
          {mutation.isError ? (
            <InlineFeedback kind="error">{t.resultsUnavailable}</InlineFeedback>
          ) : null}
          <Button
            className="gr-primary"
            disabled={mutation.isPending || !chosen.length}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t.loading : ui('confirm')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
