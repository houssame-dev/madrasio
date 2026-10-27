export interface WorkspaceContext {
  date: string;
  timezone: string;
  academicYear: { id: string; name: string } | null;
}
export interface AdminLesson {
  publicationId: string; lessonKey: string; classId: string; className: string;
  subjectName: string; teacherName: string; start: string; end: string;
  status: 'upcoming' | 'ongoing' | 'completed' | 'unavailable';
  expected: number; recorded: number; recording: 'recorded' | 'pending' | 'upcoming' | 'noRoster' | 'unavailable';
}
export interface AdminOverview extends WorkspaceContext {
  years: { id: string; name: string }[];
  selectedYear: { id: string; name: string } | null;
  metrics: null | {
    enrolled: number; classes: number; teachers: number; pending: number; recorded: number; missingTimetable: number;
    currency: string; outstandingCents: number; overdueCents: number; overdueStudents: number; collectedCents: number;
  };
  lessons: AdminLesson[];
}
