import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidateTeacher, teacherKeys } from '@/lib/frontend/teachers/queries';
import { schoolId, teacherId, yearId } from './test-helpers';

describe('Teacher tenant-safe query keys and invalidation', () => {
  it('separates Schools, list filters, detail, and Assignment history', () => {
    expect(teacherKeys.list(schoolId, { page: 1, search: 'L' })).toEqual(['teachers', schoolId, 'list', { page: 1, search: 'L' }]);
    expect(teacherKeys.assignments(schoolId, teacherId, { academicYearId: yearId })).not.toEqual(teacherKeys.assignments('school-b', teacherId, { academicYearId: yearId }));
  });

  it('invalidates only list, detail, and all Assignment pages without clearing the client', async () => {
    const queryClient = new QueryClient(); const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(); const clear = vi.spyOn(queryClient, 'clear');
    await invalidateTeacher(queryClient, schoolId, teacherId, true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: teacherKeys.detail(schoolId, teacherId) }); expect(invalidate).toHaveBeenCalledWith({ queryKey: teacherKeys.assignmentPrefix(schoolId, teacherId) }); expect(invalidate).toHaveBeenCalledWith({ queryKey: teacherKeys.lists(schoolId) }); expect(clear).not.toHaveBeenCalled();
  });
});
