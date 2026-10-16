'use client';

import { useTranslations } from 'next-intl';
import { PageLoading } from '@/components/ui/states';

type LoadingKey = 'peopleTeachers.loadingTeachers' | 'peopleTeachers.loadingTeacher'
  | 'peopleStudents.loadingStudents' | 'peopleStudents.loadingStudent'
  | 'peopleParents.loadingParents' | 'peopleParents.loadingParent'
  | 'parentPortal.childrenLoading' | 'announcementUi.loading' | 'notificationUi.loading'
  | 'academic.loadingWorkspace' | 'attendance.loading' | 'grades.loading' | 'homework.loading';

/** RSC sends an approved key, never text translated for a later preference. */
export function RouteLoading({ messageKey }: { messageKey: LoadingKey }) {
  const t = useTranslations();
  return <PageLoading label={t(messageKey)} />;
}
