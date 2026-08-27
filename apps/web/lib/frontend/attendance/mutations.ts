import type { QueryClient } from '@tanstack/react-query';
import { attendanceApi } from './api';
import { attendanceKeys } from './queries';
import type { AttendanceEntryInput } from './types';

export async function saveDailyAttendance(queryClient: QueryClient, schoolId: string, classId: string, date: string, records: AttendanceEntryInput[]) {
  const response = await attendanceApi.saveDaily(classId, date, records);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: attendanceKeys.dailyPrefix(schoolId, classId, date) }),
    ...records.map((record) => queryClient.invalidateQueries({ queryKey: attendanceKeys.historyPrefix(schoolId, record.studentId) })),
  ]);
  return response;
}

