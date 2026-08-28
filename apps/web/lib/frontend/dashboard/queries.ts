import { listAllAssignments, teachersApi } from '@/lib/frontend/teachers/api';
import type { TeacherAssignmentDto, TeacherDto } from '@/lib/frontend/teachers/types';

export const dashboardKeys = {
  assignments: (schoolId: string, teacherIds: string[]) => ['dashboard', schoolId, 'teacher-assignments', [...teacherIds].sort()] as const,
};

export const selfTeacherListParams = { page: 1, pageSize: 100, status: 'ACTIVE' as const };

export async function listSelfTeacherProfiles(): Promise<TeacherDto[]> {
  const first = await teachersApi.list(selfTeacherListParams);
  const rows = [...first.data];
  for (let page = 2; page <= Math.ceil(first.meta.total / 100); page += 1) {
    rows.push(...(await teachersApi.list({ ...selfTeacherListParams, page })).data);
  }
  return rows.filter((profile) => profile.status === 'ACTIVE');
}

export async function listSelfActiveAssignments(profiles: TeacherDto[]): Promise<TeacherAssignmentDto[]> {
  const rows = (await Promise.all(profiles.map((profile) => listAllAssignments(profile.id, { status: 'ACTIVE' })))).flat();
  return rows.filter((assignment) => assignment.status === 'ACTIVE');
}
