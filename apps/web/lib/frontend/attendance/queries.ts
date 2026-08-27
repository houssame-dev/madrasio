import type { AttendanceHistoryParams } from './types';

export const attendanceKeys = {
  all: (schoolId: string) => ['attendance', schoolId] as const,
  dailyPrefix: (schoolId: string, classId: string, date: string) => ['attendance', schoolId, 'daily', classId, date] as const,
  daily: (schoolId: string, classId: string, date: string, page: number) => ['attendance', schoolId, 'daily', classId, date, page] as const,
  historyPrefix: (schoolId: string, studentId: string) => ['attendance', schoolId, 'history', studentId] as const,
  history: (schoolId: string, studentId: string, params: AttendanceHistoryParams) => ['attendance', schoolId, 'history', studentId, params] as const,
  teacherClasses: (schoolId: string) => ['attendance', schoolId, 'teacher-classes'] as const,
};

