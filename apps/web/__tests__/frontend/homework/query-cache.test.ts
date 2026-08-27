import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidateHomeworkSubmission, invalidateHomeworkTargets } from '@/lib/frontend/homework/mutations';
import { homeworkKeys } from '@/lib/frontend/homework/queries';
import { homeworkId, schoolId, submissionId } from './test-helpers';

describe('Homework query cache', () => {
  it('separates keys by School, resource, filters, and page', () => {
    expect(homeworkKeys.list(schoolId, { page: 1 })).not.toEqual(homeworkKeys.list('other-school', { page: 1 }));
    expect(homeworkKeys.list(schoolId, { page: 1 })).not.toEqual(homeworkKeys.list(schoolId, { page: 2 }));
    expect(homeworkKeys.roster(schoolId, homeworkId, 1)).not.toEqual(homeworkKeys.roster(schoolId, homeworkId, 2));
    expect(homeworkKeys.targets(schoolId, homeworkId)).not.toEqual(homeworkKeys.detail(schoolId, homeworkId));
  });

  it('invalidates only targets, the affected roster, and detail after target attachment', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await invalidateHomeworkTargets(client, schoolId, homeworkId);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeworkKeys.targets(schoolId, homeworkId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeworkKeys.rosterPrefix(schoolId, homeworkId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeworkKeys.detail(schoolId, homeworkId) });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: homeworkKeys.all(schoolId) });
  });

  it('invalidates only the affected roster and Submission caches after Submission change', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await invalidateHomeworkSubmission(client, schoolId, homeworkId, submissionId);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeworkKeys.rosterPrefix(schoolId, homeworkId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeworkKeys.submissionLists(schoolId, homeworkId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeworkKeys.submission(schoolId, submissionId) });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: homeworkKeys.all(schoolId) });
  });
});
