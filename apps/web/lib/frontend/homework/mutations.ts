import type { QueryClient } from '@tanstack/react-query';
import { homeworkKeys } from './queries';

export async function invalidateHomework(queryClient: QueryClient, schoolId: string, homeworkId: string, includeLists = false) {
  const tasks = [queryClient.invalidateQueries({ queryKey: homeworkKeys.detail(schoolId, homeworkId) })];
  if (includeLists) tasks.push(queryClient.invalidateQueries({ queryKey: homeworkKeys.lists(schoolId) }));
  await Promise.all(tasks);
}

export async function invalidateHomeworkTargets(queryClient: QueryClient, schoolId: string, homeworkId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: homeworkKeys.targets(schoolId, homeworkId) }),
    queryClient.invalidateQueries({ queryKey: homeworkKeys.rosterPrefix(schoolId, homeworkId) }),
    queryClient.invalidateQueries({ queryKey: homeworkKeys.detail(schoolId, homeworkId) }),
  ]);
}

export async function invalidateHomeworkSubmission(queryClient: QueryClient, schoolId: string, homeworkId: string, submissionId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: homeworkKeys.rosterPrefix(schoolId, homeworkId) }),
    queryClient.invalidateQueries({ queryKey: homeworkKeys.submissionLists(schoolId, homeworkId) }),
    queryClient.invalidateQueries({ queryKey: homeworkKeys.submission(schoolId, submissionId) }),
  ]);
}

