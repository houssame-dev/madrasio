import { describe, expect, it } from 'vitest';
import { announcementContentSchema, announcementScheduleSchema, announcementTargetSchema } from '@/lib/frontend/announcements/schemas';
import { classId, yearId } from './test-helpers';
describe('Announcement frontend contracts', () => {
  it('accepts only exact target and audience enums with valid target shape', () => { expect(announcementTargetSchema.safeParse({ audience: 'PARENTS', targetType: 'CLASS', academicYearId: yearId, classId }).success).toBe(true); expect(announcementTargetSchema.safeParse({ audience: 'STUDENTS', targetType: 'CLASS', academicYearId: yearId, classId }).success).toBe(false); expect(announcementTargetSchema.safeParse({ audience: 'TEACHERS', targetType: 'SCHOOL', academicYearId: yearId, classId }).success).toBe(false); });
  it('keeps content bounded plain text and validates schedule input', () => { expect(announcementContentSchema.safeParse({ title: '', body: 'Body' }).success).toBe(false); expect(announcementContentSchema.safeParse({ title: 'Title', body: '<b>plain text</b>' }).success).toBe(true); expect(announcementScheduleSchema.safeParse({ scheduledAt: 'not-a-date' }).success).toBe(false); });
});
