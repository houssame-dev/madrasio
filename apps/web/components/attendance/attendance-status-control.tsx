'use client';

import { selectClassName } from '@/components/academic/ui';
import { useAttendanceCopy } from '@/i18n/use-domain-copy';
import { attendanceStatuses } from '@/lib/frontend/attendance/schemas';
import type { AttendanceStatus } from '@/lib/frontend/attendance/types';

export function AttendanceStatusControl({ name, value, disabled, onChange }: {
  name: string;
  value: AttendanceStatus | '';
  disabled?: boolean;
  onChange: (value: AttendanceStatus) => void;
}) {
  const t = useAttendanceCopy();
  return <select aria-label={t.statusFor(name)} className={selectClassName} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as AttendanceStatus)}>
    <option value="" disabled>{t.notMarked}</option>
    {attendanceStatuses.map((status) => <option key={status} value={status}>{t.statuses[status]}</option>)}
  </select>;
}

