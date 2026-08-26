'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { ConfirmDialog, EmptyTableRow, Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import { ApiErrorState } from '@/components/ui/states';
import { studentsApi } from '@/lib/frontend/students/api';
import { studentKeys } from '@/lib/frontend/students/queries';
import { parentsApi } from '@/lib/frontend/parents/api';
import { parentCopy as t } from '@/lib/frontend/parents/copy';
import { parentErrorMessage } from '@/lib/frontend/parents/errors';
import { parentKeys } from '@/lib/frontend/parents/queries';
import type { ParentRelationshipDto } from '@/lib/frontend/parents/types';

export function RelationshipsPanel({ schoolId, parentId, page, onPage, onChanged }: { schoolId: string; parentId: string; page: number; onPage: (page: number) => void; onChanged: () => Promise<void> | void }) {
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
    catch (error) { setEndError(parentErrorMessage(error)); }
    finally { setPending(false); }
  };
  if (query.isError) return <ApiErrorState title={t.unavailable} description={t.unavailableDescription} onRetry={() => void query.refetch()} />;
  return <section className="space-y-4">
    <div><h2 className="text-lg font-semibold">{t.relationshipHistory}</h2><p className="mt-1 text-sm text-muted-foreground">{t.relationshipDescription}</p></div>
    <TableShell headers={[t.student, t.studentCode, t.linkedOn, t.status, t.actions]} loading={query.isPending}>
      {query.data?.data.length === 0 ? <EmptyTableRow columns={5} /> : query.data?.data.map((relationship) => {
        const student = identities[studentIds.indexOf(relationship.studentId)]?.data;
        return <tr key={relationship.id}><td className="px-4 py-3 font-medium">{student ? `${student.firstName} ${student.lastName}` : t.unknown}</td><td className="px-4 py-3">{student?.studentCode ?? t.unknown}</td><td className="px-4 py-3">{relationship.createdAt.slice(0, 10)}</td><td className="px-4 py-3"><StatusBadge status={relationship.status} /></td><td className="px-4 py-3 text-end">{relationship.status === 'ACTIVE' ? <Button type="button" variant="outline" size="sm" onClick={() => setEnding(relationship)}>{t.endRelationship}</Button> : null}</td></tr>;
      })}
    </TableShell>
    {query.data ? <Pagination {...query.data.meta} onPage={onPage} /> : null}
    <ConfirmDialog open={ending != null} title={t.endTitle} description={`${t.endDescription} ${t.historicalStable}`} pending={pending} error={endError} onClose={() => { setEnding(undefined); setEndError(undefined); }} onConfirm={() => void end()} />
  </section>;
}
