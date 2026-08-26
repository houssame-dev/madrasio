import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidateStudent, studentKeys } from '@/lib/frontend/students/queries';
import { classId, schoolId, studentId, yearId } from './test-helpers';

describe('Student tenant-safe query keys and invalidation', () => {
  it('separates School, list filters, Student, history, and explicit Year placement', () => {
    expect(studentKeys.list(schoolId, { page: 1, search: 'A' })).toEqual(['students', schoolId, 'list', { page: 1, search: 'A' }]);
    expect(studentKeys.current(schoolId, studentId, yearId)).toEqual(['students', schoolId, 'current-enrollment', studentId, yearId]);
    expect(studentKeys.current('school-b', studentId, yearId)).not.toEqual(studentKeys.current(schoolId, studentId, yearId));
    expect(studentKeys.list(schoolId, { academicYearId: yearId, classId })).not.toEqual(studentKeys.list(schoolId, { academicYearId: yearId }));
  });

  it('invalidates detail, all history pages, and all selected-Year placements without clearing the client', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const clear = vi.spyOn(queryClient, 'clear');
    await invalidateStudent(queryClient, schoolId, studentId, true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: studentKeys.detail(schoolId, studentId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: studentKeys.enrollmentPrefix(schoolId, studentId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: studentKeys.currentPrefix(schoolId, studentId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: studentKeys.lists(schoolId) });
    expect(clear).not.toHaveBeenCalled();
  });
});
