import type { QueryClient } from '@tanstack/react-query';
import { announcementKeys } from './queries';

export async function invalidateAnnouncement(queryClient: QueryClient, schoolId: string, id: string, parts: { list?: boolean; versions?: boolean; targets?: boolean; publications?: boolean } = {}) {
  const tasks = [queryClient.invalidateQueries({ queryKey: announcementKeys.detail(schoolId, id) })];
  if (parts.list) tasks.push(queryClient.invalidateQueries({ queryKey: announcementKeys.lists(schoolId) }));
  if (parts.versions) tasks.push(queryClient.invalidateQueries({ queryKey: announcementKeys.versions(schoolId, id) }));
  if (parts.targets) tasks.push(queryClient.invalidateQueries({ queryKey: ['announcements', schoolId, 'targets', id] }));
  if (parts.publications) tasks.push(queryClient.invalidateQueries({ queryKey: announcementKeys.publications(schoolId, id) }));
  await Promise.all(tasks);
}
