'use client';
import { usePeopleText } from '@/i18n/use-people-text';

import Link from 'next/link';
import { ExternalLink, Pencil } from 'lucide-react';
import { Button } from '@school/ui';
import { EmptyTableRow, Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import { useTeacherCopy } from '@/i18n/use-people-copy';
import type { PageResponse, TeacherDto } from '@/lib/frontend/teachers/types';

export function TeachersTable({ result, loading, canManage, onEdit, onPage }: { result?: PageResponse<TeacherDto>; loading: boolean; canManage: boolean; onEdit: (teacher: TeacherDto) => void; onPage: (page: number) => void }) {
  const t = useTeacherCopy();
  const text = usePeopleText();

  return <div className="space-y-4">
    <TableShell headers={[t.lastName, t.firstName, t.teacherCode, t.linkedAccount, t.status, t.actions]} loading={loading}>
      {result?.data.length === 0 ? <EmptyTableRow columns={6} /> : result?.data.map((teacher) => {
        const name = `${teacher.firstName} ${teacher.lastName}`;
        return <tr key={teacher.id}>
          <td dir="auto" className="px-4 py-3 font-medium">{teacher.lastName}</td><td dir="auto" className="px-4 py-3">{teacher.firstName}</td>
          <td dir="auto" className="px-4 py-3 text-muted-foreground">{teacher.teacherCode ?? t.unknown}</td>
          <td dir="auto" className="px-4 py-3">{teacher.userId ? t.linked : t.unlinked}</td><td dir="auto" className="px-4 py-3"><StatusBadge status={teacher.status} label={text(teacher.status)} /></td>
          <td dir="auto" className="px-4 py-3"><div className="flex justify-end gap-1"><Link href={`/teachers/${teacher.id}`} aria-label={t.openTeacher(name)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t.profile}<ExternalLink className="size-4" aria-hidden="true" /></Link>{canManage && teacher.status !== 'ARCHIVED' ? <Button type="button" variant="ghost" size="sm" aria-label={`${t.edit} ${name}`} onClick={() => onEdit(teacher)}><Pencil className="size-4" aria-hidden="true" /></Button> : null}</div></td>
        </tr>;
      })}
    </TableShell>{result ? <Pagination {...result.meta} onPage={onPage} /> : null}
  </div>;
}
