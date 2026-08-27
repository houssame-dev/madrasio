'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@school/ui';
import { EmptyTableRow, Modal, Pagination, SectionHeader, StatusBadge, TableShell } from '@/components/academic/ui';
import { ApiErrorState } from '@/components/ui/states';
import { homeworkApi } from '@/lib/frontend/homework/api';
import { homeworkCopy as t } from '@/lib/frontend/homework/copy';
import { homeworkErrorMessage } from '@/lib/frontend/homework/errors';
import { homeworkKeys } from '@/lib/frontend/homework/queries';
import type { HomeworkDto, HomeworkRosterRowDto } from '@/lib/frontend/homework/types';
import { SubmissionDetail } from './submission-detail';
import { SubmissionForm } from './submission-form';

export function HomeworkRoster({ schoolId, homework }: { schoolId: string; homework: HomeworkDto }) {
  const [page, setPage] = useState(1); const [creating, setCreating] = useState<HomeworkRosterRowDto>(); const [viewing, setViewing] = useState<HomeworkRosterRowDto>();
  const query = useQuery({ queryKey: homeworkKeys.roster(schoolId, homework.id, page), queryFn: () => homeworkApi.roster(homework.id, page) });
  const studentName = (row: HomeworkRosterRowDto) => `${row.student.firstName} ${row.student.lastName}`;
  return <section className="space-y-4"><SectionHeader title={t.roster} description={t.rosterHint} />{query.isError ? <ApiErrorState title={t.unavailable} description={homeworkErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : <><TableShell headers={[t.student, t.status, t.submittedAt, t.actions]} loading={query.isPending}>{query.data?.data.length === 0 ? <EmptyTableRow columns={4} /> : query.data?.data.map((row) => <tr key={row.student.id}><th scope="row" className="px-4 py-3 text-start font-medium">{studentName(row)}<span className="block text-xs font-normal text-muted-foreground">{row.student.studentCode ?? '—'}</span></th><td className="px-4 py-3">{row.submission ? <StatusBadge status={row.submission.status} /> : <span className="text-muted-foreground">{t.notSubmitted}</span>}</td><td className="px-4 py-3">{row.submission ? new Date(row.submission.submittedAt).toLocaleString() : '—'}</td><td className="px-4 py-3 text-end">{row.submission ? <Button type="button" size="sm" variant="outline" onClick={() => setViewing(row)}>{t.viewSubmission}</Button> : homework.status === 'PUBLISHED' ? <Button type="button" size="sm" onClick={() => setCreating(row)}>{t.createSubmission}</Button> : null}</td></tr>)}</TableShell>{query.data ? <Pagination {...query.data.meta} onPage={setPage} /> : null}</>}
    <Modal open={creating != null} title={creating ? `${t.createSubmission}: ${studentName(creating)}` : t.createSubmission} description={t.lateOwned} onClose={() => setCreating(undefined)}>{creating ? <SubmissionForm schoolId={schoolId} homeworkId={homework.id} studentId={creating.student.id} onCancel={() => setCreating(undefined)} onSaved={() => setCreating(undefined)} /> : null}</Modal>
    {viewing?.submission ? <SubmissionDetail schoolId={schoolId} homework={homework} submissionId={viewing.submission.id} studentName={studentName(viewing)} onClose={() => setViewing(undefined)} /> : null}
  </section>;
}
