import { Suspense } from 'react';
import { AttendanceWorkspace } from '@/components/attendance/attendance-workspace';
import { RouteLoading } from '@/components/language/route-presentation';

export default function AttendancePage() {
  return <Suspense fallback={<RouteLoading messageKey="attendance.loading" />}><AttendanceWorkspace /></Suspense>;
}
