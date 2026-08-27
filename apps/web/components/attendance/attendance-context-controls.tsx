'use client';

import { Field, inputClassName, selectClassName } from '@/components/academic/ui';
import { attendanceCopy as t } from '@/lib/frontend/attendance/copy';
import type { AcademicYearDto, ClassDto } from '@/lib/frontend/academic/types';

export function AttendanceContextControls({ years, classes, academicYearId, classId, date, teacherScoped, onYear, onClass, onDate }: {
  years: AcademicYearDto[];
  classes: ClassDto[];
  academicYearId: string;
  classId: string;
  date: string;
  teacherScoped: boolean;
  onYear: (value: string) => void;
  onClass: (value: string) => void;
  onDate: (value: string) => void;
}) {
  return <section className="space-y-3 rounded-lg border bg-card p-4" aria-label={t.daily}>
    <div className="grid gap-4 md:grid-cols-3">
      <Field label={t.academicYear} htmlFor="attendance-year"><select id="attendance-year" className={selectClassName} value={academicYearId} onChange={(event) => onYear(event.target.value)}><option value="">{t.selectYear}</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}</select></Field>
      <Field label={t.klass} htmlFor="attendance-class"><select id="attendance-class" className={selectClassName} value={classId} disabled={!academicYearId} onChange={(event) => onClass(event.target.value)}><option value="">{t.selectClass}</option>{classes.map((klass) => <option key={klass.id} value={klass.id}>{klass.name} · {klass.status}</option>)}</select></Field>
      <Field label={t.date} htmlFor="attendance-date"><input id="attendance-date" aria-label={t.date} type="date" className={inputClassName} value={date} onChange={(event) => onDate(event.target.value)} /></Field>
    </div>
    <p className="text-xs text-muted-foreground">{teacherScoped ? t.teacherScope : t.noGlobalYear}</p>
  </section>;
}

