import { apiRequest } from '@/lib/frontend/api-client';
import { listAllAssignments, teachersApi } from '@/lib/frontend/teachers/api';
import type { PageResponse, TeacherDto } from '@/lib/frontend/teachers/types';
import type {
  AttendanceEntryInput, AttendanceHistoryParams, AttendanceHistoryResponse,
  AttendanceRecordDto, DailyRosterResponse,
} from './types';

function query(path: `/api/v1/${string}`, params: object = {}): `/api/v1/${string}` {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') values.set(key, String(value));
  const suffix = values.toString();
  return `${path}${suffix ? `?${suffix}` : ''}` as `/api/v1/${string}`;
}

export const attendanceApi = {
  daily: (classId: string, date: string, page = 1) => apiRequest<DailyRosterResponse>(query(`/api/v1/classes/${classId}/attendance/${date}`, { page, pageSize: 100 })),
  saveDaily: (classId: string, date: string, records: AttendanceEntryInput[]) => apiRequest<{ data: { records: AttendanceRecordDto[] } }>(`/api/v1/classes/${classId}/attendance/${date}`, { method: 'PUT', body: JSON.stringify({ records }) }),
  studentHistory: (studentId: string, params: AttendanceHistoryParams) => apiRequest<AttendanceHistoryResponse>(query(`/api/v1/students/${studentId}/attendance`, params)),
};

export async function teacherAttendanceClassIds(): Promise<string[]> {
  const first = await teachersApi.list({ status: 'ACTIVE', page: 1, pageSize: 100 });
  const profiles: TeacherDto[] = [...first.data];
  for (let page = 2; page <= Math.ceil(first.meta.total / 100); page += 1) {
    profiles.push(...(await teachersApi.list({ status: 'ACTIVE', page, pageSize: 100 }) as PageResponse<TeacherDto>).data);
  }
  const assignments = (await Promise.all(profiles.map((profile) => listAllAssignments(profile.id, { status: 'ACTIVE' })))).flat();
  return [...new Set(assignments.map((assignment) => assignment.classId))];
}

