/**
 * Notifications domain vocabulary + content (Task 010 §3/§4/§6/§21/§22).
 *
 * Pure unit tests — no database. The vocabulary must mirror the exact
 * identifiers in the database enums (migration 0012), and content generation
 * must be deterministic and based on the immutable source snapshot.
 */

import { describe, expect, it } from 'vitest';

import {
  createAnnouncementPublishedNotificationContent,
  createResultPublishedNotificationContent,
  createResultRevisedNotificationContent,
} from '@/lib/modules/notifications/domain/notification-content';
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_SOURCE_TYPES,
  NOTIFICATION_SOURCE_TYPES_BY_SOURCE_TYPE,
  NOTIFICATION_TYPES,
  notificationSourceTypeForEvent,
  notificationTypeForEvent,
} from '@/lib/modules/notifications/domain/notification-vocabulary';

describe('vocabulary mirrors the database enums (Task 010 §3/§4)', () => {
  it('notification types match the `notification_type` enum (migration 0012)', () => {
    expect(NOTIFICATION_TYPES).toEqual(['ANNOUNCEMENT_PUBLISHED', 'RESULT_PUBLISHED', 'RESULT_REVISED']);
  });

  it('source types match the `notification_source_type` enum (migration 0012)', () => {
    expect(NOTIFICATION_SOURCE_TYPES).toEqual(['ANNOUNCEMENT_PUBLICATION', 'RESULT_PUBLICATION']);
  });

  it('consumed events are the V1 outbox event vocabulary', () => {
    expect(NOTIFICATION_EVENTS).toEqual([
      'AnnouncementPublished',
      'AnnouncementRevisionPublished',
      'ResultPublished',
      'ResultRevisionPublished',
    ]);
  });

  it('type ↔ source mapping matches the `notifications_type_source_check` CHECK', () => {
    expect(NOTIFICATION_SOURCE_TYPES_BY_SOURCE_TYPE.ANNOUNCEMENT_PUBLICATION).toEqual(['ANNOUNCEMENT_PUBLISHED']);
    expect(NOTIFICATION_SOURCE_TYPES_BY_SOURCE_TYPE.RESULT_PUBLICATION).toEqual(['RESULT_PUBLISHED', 'RESULT_REVISED']);
  });

  it('maps events to notification + source types (and null for unknown events)', () => {
    expect(notificationTypeForEvent('AnnouncementPublished')).toBe('ANNOUNCEMENT_PUBLISHED');
    expect(notificationSourceTypeForEvent('AnnouncementPublished')).toBe('ANNOUNCEMENT_PUBLICATION');
    expect(notificationTypeForEvent('AnnouncementRevisionPublished')).toBe('ANNOUNCEMENT_PUBLISHED');
    expect(notificationSourceTypeForEvent('AnnouncementRevisionPublished')).toBe('ANNOUNCEMENT_PUBLICATION');
    expect(notificationTypeForEvent('ResultPublished')).toBe('RESULT_PUBLISHED');
    expect(notificationSourceTypeForEvent('ResultPublished')).toBe('RESULT_PUBLICATION');
    expect(notificationTypeForEvent('ResultRevisionPublished')).toBe('RESULT_REVISED');
    expect(notificationSourceTypeForEvent('ResultRevisionPublished')).toBe('RESULT_PUBLICATION');
    expect(notificationTypeForEvent('BillingCreated')).toBeNull();
    expect(notificationSourceTypeForEvent('BillingCreated')).toBeNull();
  });
});

describe('notification content (Task 010 §21/§22)', () => {
  it('announcement content uses the immutable version title', () => {
    expect(createAnnouncementPublishedNotificationContent('Reunion')).toEqual({
      title: 'Reunion',
      body: 'A new announcement was published for your school.',
    });
  });

  it('announcement content is deterministic', () => {
    const a = createAnnouncementPublishedNotificationContent('Reunion');
    const b = createAnnouncementPublishedNotificationContent('Reunion');
    expect(a).toEqual(b);
  });

  it('result content is deterministic and distinguishes publish vs revision', () => {
    const input = { resultLabel: 'Mathematics — Term 1', resultValue: '15.50' };
    expect(createResultPublishedNotificationContent(input)).toEqual({
      title: 'Result published',
      body: 'Mathematics — Term 1: 15.50',
    });
    expect(createResultRevisedNotificationContent(input)).toEqual({
      title: 'Result revised',
      body: 'Mathematics — Term 1: 15.50',
    });
  });
});