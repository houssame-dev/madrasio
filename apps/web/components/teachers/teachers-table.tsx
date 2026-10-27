'use client';
import { useTranslations } from 'next-intl';
import { usePeopleText } from '@/i18n/use-people-text';

import Link from 'next/link';
import { ExternalLink, Pencil } from 'lucide-react';
import { Button } from '@school/ui';
import { EmptyTableRow, Pagination, StatusBadge, TableShell } from '@/components/academic/ui';
import { useTeacherCopy } from '@/i18n/use-people-copy';
import type { PageResponse, TeacherDto } from '@/lib/frontend/teachers/types';

export function TeachersTable({ result, loading, canManage, onEdit, onPage }: { result?: PageResponse<TeacherDto>; loading: boolean; canManage: boolean; onEdit: (teacher: TeacherDto) => void; onPage: (page: number) => void }) {
  const ui=useTranslations('peopleExperience');
  const t = useTeacherCopy();
  const text = usePeopleText();

  return <div className="space-y-4">
    <div className="pp-directory-table"><TableShell responsive headers={[ui('name'), t.teacherCode, t.linkedAccount, t.status, t.actions]} loading={loading}>
      {result?.data.length === 0 ? <EmptyTableRow columns={5} /> : result?.data.map((teacher) => {
        const name = `${teacher.firstName} ${teacher.lastName}`;
        return <tr key={teacher.id}>
          <td className="pp-directory-name px-4 py-3"><bdi><span>{teacher.firstName}</span>{' '}<span>{teacher.lastName}</span></bdi></td>
          <td dir="auto" className="pp-directory-code px-4 py-3 text-muted-foreground">{teacher.teacherCode ?? t.unknown}</td>
          <td dir="auto" className="pp-directory-account px-4 py-3">{teacher.userId ? t.linked : t.unlinked}</td><td dir="auto" className="pp-directory-status px-4 py-3"><StatusBadge brand status={teacher.status} label={text(teacher.status)} /></td>
          <td dir="auto" className="pp-directory-actions px-4 py-3"><div className="flex flex-wrap justify-end gap-1"><Link href={`/teachers/${teacher.id}`} aria-label={t.openTeacher(name)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t.profile}<ExternalLink className="size-4" aria-hidden="true" /></Link>{canManage && teacher.status !== 'ARCHIVED' ? <Button type="button" variant="ghost" size="sm" aria-label={`${t.edit} ${name}`} onClick={() => onEdit(teacher)}><Pencil className="size-4" aria-hidden="true" /></Button> : null}</div></td>
        </tr>;
      })}
    </TableShell></div>{result ? <Pagination {...result.meta} onPage={onPage} /> : null}
  </div>;
}
