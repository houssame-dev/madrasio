'use client';
import type { ReactNode } from 'react';
import { usePeopleText } from '@/i18n/use-people-text';

import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ConfirmDialog, EmptyTableRow, Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import { ApiErrorState } from '@/components/ui/states';
import { studentsApi } from '@/lib/frontend/students/api';
import { studentKeys } from '@/lib/frontend/students/queries';
import { parentsApi } from '@/lib/frontend/parents/api';
import { useParentCopy } from '@/i18n/use-people-copy';
import { parentErrorMessage } from '@/lib/frontend/parents/errors';
import { parentKeys } from '@/lib/frontend/parents/queries';
import type { ParentRelationshipDto } from '@/lib/frontend/parents/types';

export function RelationshipsPanel({ schoolId, parentId, page, onPage, onChanged, createAction, personLabel }: { personLabel?: string; createAction?: ReactNode; schoolId: string; parentId: string; page: number; onPage: (page: number) => void; onChanged: () => Promise<void> | void }) {
  const t = useParentCopy();
  const text = usePeopleText();

  const [ending, setEnding] = useState<ParentRelationshipDto>();
  const [pending, setPending] = useState(false);
  const [endError, setEndError] = useState<string>();
  const params = { page, pageSize: 20 };
  const query = useQuery({ queryKey: parentKeys.relationships(schoolId, parentId, params), queryFn: () => parentsApi.relationships(parentId, params) });
  const studentIds = [...new Set((query.data?.data ?? []).map((relationship) => relationship.studentId))];
  const identities = useQueries({ queries: studentIds.map((studentId) => ({ queryKey: studentKeys.detail(schoolId, studentId), queryFn: () => studentsApi.detail(studentId), retry: false })) });
  const end = async () => {
    if (!ending) return;
    setPending(true); setEndError(undefined);
    try { await parentsApi.endRelationship(ending.id); await onChanged(); setEnding(undefined); }
    catch (error) { setEndError(text(parentErrorMessage(error))); }
    finally { setPending(false); }
  };
  if (query.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => void query.refetch()} />;
  return <section className="space-y-4 pp-history-table">
    <div className="pp-section-heading"><div><h2 id="parent-history" tabIndex={-1} className="scroll-mt-24 text-lg font-semibold">{t.relationshipHistory}</h2><p className="mt-1 text-sm text-muted-foreground">{t.relationshipDescription}</p></div>{createAction}</div>
    <TableShell responsive headers={[t.student, t.studentCode, t.linkedOn, t.status, t.actions]} loading={query.isPending}>
      {query.data?.data.length === 0 ? <EmptyTableRow columns={5} /> : query.data?.data.map((relationship) => {
        const student = identities[studentIds.indexOf(relationship.studentId)]?.data;
        return <tr key={relationship.id}><td dir="auto" className="px-4 py-3 font-medium">{student ? `${student.firstName} ${student.lastName}` : t.unknown}</td><td dir="auto" className="px-4 py-3">{student?.studentCode ?? t.unknown}</td><td dir="auto" className="px-4 py-3">{relationship.createdAt.slice(0, 10)}</td><td dir="auto" className="px-4 py-3"><StatusBadge brand status={relationship.status} label={text(relationship.status)} /></td><td dir="auto" className={`px-4 py-3 text-end ${relationship.status === 'ACTIVE' ? '' : 'pp-empty-action'}`}>{relationship.status === 'ACTIVE' ? <Button type="button" variant="outline" size="sm" onClick={() => setEnding(relationship)}>{t.endRelationship}</Button> : null}</td></tr>;
      })}
    </TableShell>
    {query.data ? <Pagination {...query.data.meta} onPage={onPage} /> : null}
    <ConfirmDialog open={ending != null} title={t.endTitle} description={`${personLabel ? personLabel+' · ' : ''}${ending ? (()=>{const child=identities[studentIds.indexOf(ending.studentId)]?.data;return child ? `${child.firstName} ${child.lastName} (${child.studentCode ?? t.unknown}). ` : '';})() : ''}${t.endDescription} ${t.historicalStable}`} pending={pending} error={endError} onClose={() => { setEnding(undefined); setEndError(undefined); }} onConfirm={() => void end()} />
  </section>;
}
