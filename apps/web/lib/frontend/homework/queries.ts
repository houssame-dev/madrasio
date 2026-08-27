import type { HomeworkListParams, HomeworkSubmissionListParams } from './types';

export const homeworkKeys = {
  all: (schoolId: string) => ['homework', schoolId] as const,
  lists: (schoolId: string) => ['homework', schoolId, 'list'] as const,
  list: (schoolId: string, params: HomeworkListParams) => ['homework', schoolId, 'list', params] as const,
  detail: (schoolId: string, id: string) => ['homework', schoolId, 'detail', id] as const,
  targets: (schoolId: string, id: string) => ['homework', schoolId, 'targets', id] as const,
  rosterPrefix: (schoolId: string, id: string) => ['homework', schoolId, 'roster', id] as const,
  roster: (schoolId: string, id: string, page: number) => ['homework', schoolId, 'roster', id, page] as const,
  submissionLists: (schoolId: string, id: string) => ['homework', schoolId, 'submissions', id] as const,
  submissions: (schoolId: string, id: string, params: HomeworkSubmissionListParams) => ['homework', schoolId, 'submissions', id, params] as const,
  submission: (schoolId: string, id: string) => ['homework', schoolId, 'submission', id] as const,
  authorScope: (schoolId: string, userId: string) => ['homework', schoolId, 'author-scope', userId] as const,
};

