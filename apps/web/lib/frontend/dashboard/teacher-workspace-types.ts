export interface TeacherLesson {
  publicationId: string; lessonKey: string; academicYearId: string; classId: string; className: string;
  subjectName: string; start: string; end: string; roomId: string | null; roomName: string | null;
  status: 'upcoming' | 'ongoing' | 'completed' | 'unavailable';
  writable: boolean; expected: number; recorded: number;
}
export interface TeacherWorkspaceData {
  date: string; timezone: string; asOf: string; lessons: TeacherLesson[];
  pendingAttendance: number; homeworkReview: number;
}
/** Permission comes from the server session flag; the status only selects copy. */
export function teacherAttendanceAction(lesson: TeacherLesson): 'timetable' | 'record' | 'continue' | 'viewAttendance' {
  if (lesson.status === 'upcoming' || lesson.status === 'unavailable') return 'timetable';
  if (lesson.status === 'completed' || lesson.expected === 0 || lesson.recorded >= lesson.expected || !lesson.writable) return 'viewAttendance';
  return lesson.recorded > 0 ? 'continue' : 'record';
}
export function nextTeacherLesson(lessons: TeacherLesson[]) {
  return lessons.find(l => l.status === 'ongoing') ?? lessons.find(l => l.status === 'upcoming') ?? null;
}

/** Navigation hints never replace the session API's authorization. */
export function teacherSessionHint(params: Pick<URLSearchParams, 'get'>, today: string) {
  const date = params.get('date'), publicationId = params.get('publicationId'), lessonKey = params.get('lessonKey');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || date > today || !publicationId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(publicationId) || !lessonKey || lessonKey.length > 200) return null;
  return { date, selected: `${publicationId}:${lessonKey}` };
}
