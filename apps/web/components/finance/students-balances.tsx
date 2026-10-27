'use client';
import { useTranslations } from 'next-intl';
import { NativeSelect } from '@/components/ui/native-select';
import { StudentOverview } from './reports-workspace';
import { inputClassName } from '@/components/academic/ui';
export function StudentsBalances({schoolId,students,search,onSearch,studentId,onStudent,onPayments}:{schoolId:string;students:{id:string;firstName:string;lastName:string}[];search:string;onSearch:(v:string)=>void;studentId:string;onStudent:(id:string)=>void;onPayments:(id:string)=>void}) {
  const t=useTranslations('tuition'),c=useTranslations('finance');
  return <section className="space-y-4"><header><h2>{t('students')}</h2><p className="tu-copy">{t('choose')} · {t('allYears')}</p></header><div className="tu-two-columns"><label><span>{t('search')}</span><input className={inputClassName} value={search} onChange={e=>onSearch(e.target.value)} /></label><label><span>{c('student')}</span><NativeSelect value={studentId} onChange={e=>onStudent(e.target.value)}><option value="">{c('select')}</option>{students.map(s=><option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</NativeSelect></label></div>{studentId?<StudentOverview key={`${schoolId}:${studentId}`} schoolId={schoolId} id={studentId} onClose={()=>onStudent('')} onPayments={onPayments} />:null}</section>;
}
