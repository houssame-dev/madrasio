import { Suspense } from 'react';
import { AttendanceWorkspace } from '@/components/attendance/attendance-workspace';
import { PageLoading } from '@/components/ui/states';
import { attendanceCopy as t } from '@/lib/frontend/attendance/copy';

export default function AttendancePage() {
  return <Suspense fallback={<PageLoading label={t.loading} />}><AttendanceWorkspace /></Suspense>;
}
