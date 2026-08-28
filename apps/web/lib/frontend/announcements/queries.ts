import type { AnnouncementListParams } from './types';
export const announcementKeys = {
  all: (schoolId: string) => ['announcements', schoolId] as const,
  lists: (schoolId: string) => ['announcements', schoolId, 'list'] as const,
  list: (schoolId: string, params: AnnouncementListParams) => ['announcements', schoolId, 'list', params] as const,
  detail: (schoolId: string, id: string) => ['announcements', schoolId, 'detail', id] as const,
  versions: (schoolId: string, id: string) => ['announcements', schoolId, 'versions', id] as const,
  targets: (schoolId: string, id: string, versionId: string) => ['announcements', schoolId, 'targets', id, versionId] as const,
  publications: (schoolId: string, id: string) => ['announcements', schoolId, 'publications', id] as const,
  authorScope: (schoolId: string, userId: string) => ['announcements', schoolId, 'author-scope', userId] as const,
};
