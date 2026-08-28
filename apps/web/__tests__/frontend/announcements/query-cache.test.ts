import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidateAnnouncement } from '@/lib/frontend/announcements/mutations';
import { announcementKeys } from '@/lib/frontend/announcements/queries';
import { announcementId, schoolId, versionId } from './test-helpers';

describe('Announcement query cache', () => {
  it('separates School, list filters, detail, Version, target, and publication keys', () => { expect(announcementKeys.list(schoolId, { page: 1 })).not.toEqual(announcementKeys.list('other-school', { page: 1 })); expect(announcementKeys.list(schoolId, { page: 1 })).not.toEqual(announcementKeys.list(schoolId, { page: 2 })); expect(announcementKeys.targets(schoolId, announcementId, versionId)).not.toEqual(announcementKeys.detail(schoolId, announcementId)); });
  it('invalidates only explicitly affected resources', async () => { const client = new QueryClient(); const invalidate = vi.spyOn(client, 'invalidateQueries'); await invalidateAnnouncement(client, schoolId, announcementId, { list: true, publications: true }); expect(invalidate).toHaveBeenCalledWith({ queryKey: announcementKeys.detail(schoolId, announcementId) }); expect(invalidate).toHaveBeenCalledWith({ queryKey: announcementKeys.lists(schoolId) }); expect(invalidate).toHaveBeenCalledWith({ queryKey: announcementKeys.publications(schoolId, announcementId) }); expect(invalidate).not.toHaveBeenCalledWith({ queryKey: announcementKeys.all(schoolId) }); });
});
