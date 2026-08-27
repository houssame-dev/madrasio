import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveDailyAttendance } from '@/lib/frontend/attendance/mutations';
import { attendanceKeys } from '@/lib/frontend/attendance/queries';
import { classId, schoolId, studentId } from './test-helpers';

afterEach(() => vi.restoreAllMocks());

describe('Attendance query cache', () => {
  it('separates daily and history keys by School, exact context, and filters', () => {
    expect(attendanceKeys.daily(schoolId, classId, '2025-10-10', 1)).not.toEqual(attendanceKeys.daily('other-school', classId, '2025-10-10', 1));
    expect(attendanceKeys.daily(schoolId, classId, '2025-10-10', 1)).not.toEqual(attendanceKeys.daily(schoolId, classId, '2025-10-11', 1));
    expect(attendanceKeys.history(schoolId, studentId, { page: 1 })).not.toEqual(attendanceKeys.history(schoolId, studentId, { page: 2 }));
  });

  it('invalidates only the exact roster and affected Student history after persistence', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { records: [] } }));
    const client = new QueryClient(); const invalidate = vi.spyOn(client, 'invalidateQueries');
    await saveDailyAttendance(client, schoolId, classId, '2025-10-10', [{ studentId, status: 'PRESENT', note: null }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceKeys.dailyPrefix(schoolId, classId, '2025-10-10') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceKeys.historyPrefix(schoolId, studentId) });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: attendanceKeys.all(schoolId) });
  });
});

