import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { gradeKeys, invalidateGradebook } from '@/lib/frontend/grades/queries';
import { gradebookId, schoolId } from './test-helpers';

describe('Grade tenant query keys and invalidation', () => {
  it('separates School, configuration-version, list, detail, and exact Assessment caches', () => { expect(gradeKeys.gradebookList(schoolId, { page: 1, pageSize: 20 })).not.toEqual(gradeKeys.gradebookList('school-b', { page: 1, pageSize: 20 })); expect(gradeKeys.configurationVersions(schoolId)).not.toEqual(gradeKeys.configurationVersions('school-b')); expect(gradeKeys.assessmentList(schoolId, gradebookId, { page: 1, pageSize: 20 })).toEqual(['grades', schoolId, 'gradebooks', gradebookId, 'assessments', { page: 1, pageSize: 20 }]); });
  it('invalidates only relevant Gradebook and Assessment boundaries', async () => { const client = new QueryClient(); const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(); const clear = vi.spyOn(client, 'clear'); await invalidateGradebook(client, schoolId, gradebookId, true); expect(invalidate).toHaveBeenCalledWith({ queryKey: gradeKeys.gradebookDetail(schoolId, gradebookId) }); expect(invalidate).toHaveBeenCalledWith({ queryKey: gradeKeys.assessments(schoolId, gradebookId) }); expect(invalidate).toHaveBeenCalledWith({ queryKey: gradeKeys.gradebooks(schoolId) }); expect(clear).not.toHaveBeenCalled(); });
});
