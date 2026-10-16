'use client';

import { useTranslations } from 'next-intl';

// Presentation adapters preserve existing copy keys and ICU call parameters.

export function useAnnouncementCopy() {
  const t = useTranslations();
  return {
    title: t('navigation.items.announcements'),
    description: t('announcementUi.description'),
    teacherDescription: t('announcementUi.teacherDescription'),
    create: t('announcementUi.create'),
    search: t('announcementUi.search'),
    filters: t('announcementUi.filters'),
    allStatuses: t('homework.allStatuses'),
    allAudiences: t('announcementUi.allAudiences'),
    allTargets: t('announcementUi.allTargets'),
    details: t('announcementUi.details'),
    status: t('homework.status'),
    latestVersion: t('announcementUi.latestVersion'),
    updated: t('announcementUi.updated'),
    actions: t('homework.actions'),
    noAnnouncements: t('announcementUi.noAnnouncements'),
    loading: t('announcementUi.loading'),
    unavailable: t('announcementUi.unavailable'),
    back: t('announcementUi.back'),
    titleField: t('homework.titleField'),
    body: t('announcementUi.body'),
    plainText: t('announcementUi.plainText'),
    saveVersion: t('announcementUi.saveVersion'),
    newVersion: t('announcementUi.newVersion'),
    versionHistory: t('announcementUi.versionHistory'),
    versionHistoryHint: t('announcementUi.versionHistoryHint'),
    version: t('announcementUi.version'),
    created: t('announcementUi.created'),
    current: t('announcementUi.current'),
    targets: t('announcementUi.targets'),
    targetHint: t('announcementUi.targetHint'),
    noTargets: t('announcementUi.noTargets'),
    addTarget: t('announcementUi.addTarget'),
    audience: t('announcementUi.audience'),
    targetType: t('announcementUi.targetType'),
    academicYear: t('homework.academicYear'),
    class: t('grades.class'),
    wholeSchool: t('announcementUi.wholeSchool'),
    teacherScope: t('announcementUi.teacherScope'),
    publishNow: t('announcementUi.publishNow'),
    schedule: t('announcementUi.schedule'),
    archive: t('domainUi.archive'),
    publishTitle: t('announcementUi.publishTitle'),
    publishDescription: t('announcementUi.publishDescription'),
    publishedSuccess: t('announcementUi.publishedSuccess'),
    scheduleTitle: t('announcementUi.scheduleTitle'),
    scheduleDescription: t('announcementUi.scheduleDescription'),
    scheduleTime: t('announcementUi.scheduleTime'),
    timezoneHint: t('announcementUi.timezoneHint'),
    scheduledSuccess: t('announcementUi.scheduledSuccess'),
    archiveTitle: t('announcementUi.archiveTitle'),
    archiveDescription: t('announcementUi.archiveDescription'),
    publications: t('domainUi.publicationHistory'),
    publicationsHint: t('announcementUi.publicationsHint'),
    publication: t('announcementUi.publication'),
    publishedAt: t('grades.publishedAt'),
    scheduledAt: t('announcementUi.scheduledAt'),
    recipients: t('announcementUi.recipients'),
    noPublications: t('announcementUi.noPublications'),
    scheduledBoundary: t('announcementUi.scheduledBoundary'),
    noCancel: t('announcementUi.noCancel'),
    selectYear: t('homework.selectYear'),
    selectClass: t('attendance.selectClass'),
    save: t('foundation.actions.save'),
    cancel: t('foundation.actions.cancel'),
  };
}

export function useNotificationCopy() {
  const t = useTranslations();
  return {
    title: t('navigation.items.notifications'),
    description: t('notificationUi.description'),
    filters: t('notificationUi.filters'),
    status: t('notificationUi.status'),
    source: t('notificationUi.source'),
    allSources: t('notificationUi.allSources'),
    markAllRead: t('notificationUi.markAllRead'),
    markingAllRead: t('notificationUi.markingAllRead'),
    markRead: t('notificationUi.markRead'),
    markingRead: t('notificationUi.markingRead'),
    unread: t('notificationUi.unread'),
    read: t('notificationUi.read'),
    details: t('notificationUi.details'),
    received: t('notificationUi.received'),
    loading: t('notificationUi.loading'),
    unavailable: t('notificationUi.unavailable'),
    empty: t('notificationUi.empty'),
    emptyDescription: t('notificationUi.emptyDescription'),
    unreadEmpty: t('notificationUi.unreadEmpty'),
    unreadEmptyDescription: t('notificationUi.unreadEmptyDescription'),
    filteredEmpty: t('notificationUi.filteredEmpty'),
    filteredEmptyDescription: t('notificationUi.filteredEmptyDescription'),
    allRead: t('notificationUi.allRead'),
    markedAllRead: (count: number) => t('notificationUi.markedAllRead', { count }),
    unreadCount: (count: number) => t('notificationUi.unreadCount', { count }),
    close: t('notificationUi.close'),
  };
}

export function useNotificationLabels() {
  const t = useTranslations();
  return {
    notificationStatusLabels: {
      ALL: t('notificationUi.ALL'),
      UNREAD: t('notificationUi.unread'),
      READ: t('notificationUi.read'),
    },
    notificationSourceLabels: {
      ANNOUNCEMENT_PUBLICATION: t('notificationUi.ANNOUNCEMENT_PUBLICATION'),
      RESULT_PUBLICATION: t('notificationUi.RESULT_PUBLICATION'),
    },
    notificationTypeLabels: {
      ANNOUNCEMENT_PUBLISHED: t('notificationUi.ANNOUNCEMENT_PUBLISHED'),
      RESULT_PUBLISHED: t('notificationUi.RESULT_PUBLISHED'),
      RESULT_REVISED: t('notificationUi.RESULT_REVISED'),
    },
  };
}
