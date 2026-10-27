'use client';
import { useTranslations } from 'next-intl';
import { BookOpen, ClipboardList, FileText, Users } from 'lucide-react';
import Link from 'next/link';
import { attendanceHref, gradesHref, homeworkHref, type TeacherClassView } from '@/lib/frontend/dashboard/types';
export function TeacherClassCard({ group, today }: { group: TeacherClassView; today: string }) {
  const t = useTranslations('teacherWorkspace');
  return <article className="tw-class" aria-labelledby={`teacher-class-${group.key}`}>
    <div className="tw-class-heading"><span className="ws-stat-icon ws-tone-purple"><Users aria-hidden="true" /></span><div><h3 id={`teacher-class-${group.key}`}><bdi>{group.className}</bdi></h3><p><bdi>{group.academicYearName}</bdi></p></div><Link className="ws-action ms-auto" href={attendanceHref(group.academicYearId, group.classId, today)}>{t('viewAttendance')}</Link></div>
    {group.assignments.map(a => <div key={a.id} className="tw-class-subject"><div><strong><bdi>{a.subjectName}</bdi></strong><p className="tw-assignment-dates">{t('effective')}: <time dir="ltr">{a.effectiveFrom}</time> {t('through')} {a.effectiveUntil ? <time dir="ltr">{a.effectiveUntil}</time> : t('ongoingAssignment')}</p></div><div className="tw-class-links"><Link className="ws-action" href={gradesHref(a)} aria-label={`${t('grades')} · ${a.subjectName} · ${group.className}`}><ClipboardList aria-hidden="true" />{t('grades')}</Link><Link className="ws-action" href={homeworkHref(a)} aria-label={`${t('homework')} · ${a.subjectName} · ${group.className}`}><BookOpen aria-hidden="true" />{t('homework')}</Link><Link className="ws-action" href={`/results?${new URLSearchParams({ resultType: 'SUBJECT', academicYearId: a.academicYearId, classId: a.classId, subjectId: a.subjectId })}`} aria-label={`${t('results')} · ${a.subjectName} · ${group.className}`}><FileText aria-hidden="true" />{t('results')}</Link></div></div>)}
  </article>;
}
