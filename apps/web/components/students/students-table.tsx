'use client';
import { useTranslations } from 'next-intl';
import { usePeopleText } from '@/i18n/use-people-text';

import Link from 'next/link';
import { ExternalLink, Pencil } from 'lucide-react';
import { Button } from '@school/ui';
import { EmptyTableRow, Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import { useStudentCopy } from '@/i18n/use-people-copy';
import type { PageResponse, StudentDto } from '@/lib/frontend/students/types';

export function StudentsTable({ result, loading, canManage, onEdit, onPage }: { result?: PageResponse<StudentDto>; loading: boolean; canManage: boolean; onEdit: (student: StudentDto) => void; onPage: (page: number) => void }) {
  const ui=useTranslations('peopleExperience');
  const t = useStudentCopy();
  const text = usePeopleText();

  return <div className="space-y-4">
    <div className="pp-directory-table"><TableShell responsive headers={[ui('name'), t.studentCode, t.status, t.actions]} loading={loading}>
      {result?.data.length === 0 ? <EmptyTableRow columns={4} /> : result?.data.map((student) => {
        const name = `${student.firstName} ${student.lastName}`;
        return <tr key={student.id}>
          <td className="pp-directory-name px-4 py-3"><bdi><span>{student.firstName}</span>{' '}<span>{student.lastName}</span></bdi></td>
          <td dir="auto" className="pp-directory-code px-4 py-3 text-muted-foreground">{student.studentCode ?? t.unknown}</td>
          <td dir="auto" className="pp-directory-status px-4 py-3"><StatusBadge brand status={student.status} label={text(student.status)} /></td>
          <td dir="auto" className="pp-directory-actions px-4 py-3"><div className="flex flex-wrap justify-end gap-1">
            <Link href={`/students/${student.id}`} aria-label={t.openStudent(name)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t.profile}<ExternalLink className="size-4" aria-hidden="true" /></Link>
            {canManage && student.status !== 'ARCHIVED' ? <Button type="button" variant="ghost" size="sm" aria-label={`${t.edit} ${name}`} onClick={() => onEdit(student)}><Pencil className="size-4" aria-hidden="true" /></Button> : null}
          </div></td>
        </tr>;
      })}
    </TableShell></div>
    {result ? <Pagination {...result.meta} onPage={onPage} /> : null}
  </div>;
}
