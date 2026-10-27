import type { ChildAcademicYear } from './types';
import type { ChildHomeworkRow } from './api';
export interface ParentWeekOverview {
  date: string; timezone: string; asOf: string; from: string; through: string;
  upcomingCount: number; absenceRecords: number; homework: ChildHomeworkRow[];
}
export function resolveParentYear(years: ChildAcademicYear[], today: string, requested = '') {
  if (requested && years.some(y => y.id === requested)) return requested;
  const current = years.filter(y => y.status === 'ACTIVE' && y.startDate <= today && y.endDate >= today);
  return current.length === 1 ? current[0].id : '';
}
export function childJourneyHref(studentId: string, yearId: string, section?: 'attendance' | 'homework' | 'results') {
  return `/children/${studentId}?${new URLSearchParams({ academicYearId: yearId, ...(section && section !== 'results' ? { section } : {}) })}${section === 'results' ? '#results' : ''}`;
}
