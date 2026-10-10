import { parentsApi } from '@/lib/frontend/parents/api';
import { parentKeys } from '@/lib/frontend/parents/queries';
import { parentChildApi } from './api';
import type { ParentResultType } from './types';

export function parentBootstrapQuery(schoolId: string) {
  return {
    queryKey: parentKeys.selfProfiles(schoolId),
    queryFn: parentsApi.selfProfiles,
  } as const;
}

export const parentChildKeys = {
  all: (schoolId: string, studentId: string) => ['parent-children', schoolId, studentId] as const,
  academicYears: (schoolId: string, studentId: string) => [...parentChildKeys.all(schoolId, studentId), 'academic-years'] as const,
  placement: (schoolId: string, studentId: string, academicYearId: string) => [...parentChildKeys.all(schoolId, studentId), 'placement', academicYearId] as const,
  results: (schoolId: string, studentId: string, academicYearId: string, resultType: ParentResultType) => [...parentChildKeys.all(schoolId, studentId), 'results', academicYearId, resultType] as const,
};

export const childAttendanceQuery = (schoolId: string, studentId: string, yearId: string, page: number, dateFrom?: string, dateTo?: string) => ({
  queryKey: [...parentChildKeys.all(schoolId, studentId), 'attendance', yearId, page, dateFrom, dateTo],
  queryFn: () => parentChildApi.attendance(studentId, yearId, page, dateFrom, dateTo),
});
export const childHomeworkQuery = (schoolId: string, studentId: string, yearId: string, page: number) => ({
  queryKey: [...parentChildKeys.all(schoolId, studentId), 'homework', yearId, page],
  queryFn: () => parentChildApi.homework(studentId, yearId, page),
});

export const childAcademicYearsQuery = (schoolId: string, studentId: string) => ({ queryKey: parentChildKeys.academicYears(schoolId, studentId), queryFn: () => parentChildApi.academicYears(studentId) });
export const childPlacementQuery = (schoolId: string, studentId: string, academicYearId: string) => ({ queryKey: parentChildKeys.placement(schoolId, studentId, academicYearId), queryFn: () => parentChildApi.placement(studentId, academicYearId) });
export const childResultsQuery = (schoolId: string, studentId: string, academicYearId: string, resultType: ParentResultType) => ({ queryKey: parentChildKeys.results(schoolId, studentId, academicYearId, resultType), queryFn: () => parentChildApi.results(studentId, academicYearId, resultType) });
