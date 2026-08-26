'use client';

import Link from 'next/link';
import { ExternalLink, Pencil } from 'lucide-react';
import { Button } from '@school/ui';
import { EmptyTableRow, Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import { studentCopy as t } from '@/lib/frontend/students/copy';
import type { PageResponse, StudentDto } from '@/lib/frontend/students/types';

export function StudentsTable({ result, loading, canManage, onEdit, onPage }: { result?: PageResponse<StudentDto>; loading: boolean; canManage: boolean; onEdit: (student: StudentDto) => void; onPage: (page: number) => void }) {
  return <div className="space-y-4">
    <TableShell headers={[t.lastName, t.firstName, t.studentCode, t.status, t.actions]} loading={loading}>
      {result?.data.length === 0 ? <EmptyTableRow columns={5} /> : result?.data.map((student) => {
        const name = `${student.firstName} ${student.lastName}`;
        return <tr key={student.id}>
          <td className="px-4 py-3 font-medium">{student.lastName}</td>
          <td className="px-4 py-3">{student.firstName}</td>
          <td className="px-4 py-3 text-muted-foreground">{student.studentCode ?? t.unknown}</td>
          <td className="px-4 py-3"><StatusBadge status={student.status} /></td>
          <td className="px-4 py-3"><div className="flex justify-end gap-1">
            <Link href={`/students/${student.id}`} aria-label={t.openStudent(name)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t.profile}<ExternalLink className="size-4" aria-hidden="true" /></Link>
            {canManage && student.status !== 'ARCHIVED' ? <Button type="button" variant="ghost" size="sm" aria-label={`${t.edit} ${name}`} onClick={() => onEdit(student)}><Pencil className="size-4" aria-hidden="true" /></Button> : null}
          </div></td>
        </tr>;
      })}
    </TableShell>
    {result ? <Pagination {...result.meta} onPage={onPage} /> : null}
  </div>;
}
