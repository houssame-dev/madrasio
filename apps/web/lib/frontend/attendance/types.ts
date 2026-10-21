import type { ClassDto, PageMeta, PageResponse, Timestamps } from '@/lib/frontend/academic/types';
import type { StudentDto } from '@/lib/frontend/students/types';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface DailyAttendanceDto {
  id: string;
  status: AttendanceStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  version?: number;
}

export interface AttendanceRecordDto extends Timestamps {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  note: string | null;
  session?: import('@school/database').PublishedTimetableLesson | null;
}

export interface DailyRosterRow {
  student: StudentDto;
  attendance: DailyAttendanceDto | null;
}

export interface DailyRosterResponse {
  data: {
    class: ClassDto;
    attendanceDate: string;
    students: DailyRosterRow[];
    session?: AttendanceSession;
  };
  meta: PageMeta;
}

export interface AttendanceSession extends SessionLesson {
  publicationId: string; date: string; classId: string; academicYearId: string; className: string; writable: boolean;
}
type SessionLesson = import('@school/database').PublishedTimetableLesson;

export interface AttendanceEntryInput {
  studentId: string;
  status: AttendanceStatus;
  note: string | null;
}

export interface AttendanceHistoryParams {
  page?: number;
  pageSize?: number;
  academicYearId?: string;
  classId?: string;
  status?: AttendanceStatus;
  dateFrom?: string;
  dateTo?: string;
}

export type AttendanceHistoryResponse = PageResponse<AttendanceRecordDto>;
