'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, FormActions, InlineFeedback, Modal, inputClassName } from '@/components/academic/ui';
import { announcementsApi } from '@/lib/frontend/announcements/api';
import { announcementCopy as t } from '@/lib/frontend/announcements/copy';
import { announcementErrorMessage, mapAnnouncementValidation } from '@/lib/frontend/announcements/errors';
import { invalidateAnnouncement } from '@/lib/frontend/announcements/mutations';
import { announcementScheduleSchema, type AnnouncementScheduleValues } from '@/lib/frontend/announcements/schemas';

export function AnnouncementScheduleDialog({ open, schoolId, announcementId, versionId, onClose }: { open: boolean; schoolId: string; announcementId: string; versionId: string; onClose: () => void }) {
  const queryClient = useQueryClient(); const [error, setError] = useState<string>(); const form = useForm<AnnouncementScheduleValues>({ resolver: zodResolver(announcementScheduleSchema), defaultValues: { scheduledAt: '' } });
  const mutation = useMutation({ mutationFn: (value: AnnouncementScheduleValues) => announcementsApi.publish(announcementId, versionId, new Date(value.scheduledAt).toISOString()), onSuccess: async () => { await invalidateAnnouncement(queryClient, schoolId, announcementId, { list: true, publications: true }); onClose(); }, onError: (value) => { if (!mapAnnouncementValidation(value, form.setError)) setError(announcementErrorMessage(value)); } });
  return <Modal open={open} title={t.scheduleTitle} description={t.scheduleDescription} onClose={onClose}><form className="space-y-4" noValidate onSubmit={form.handleSubmit((value) => mutation.mutate(value))}>{error ? <InlineFeedback kind="error">{error}</InlineFeedback> : null}<Field label={t.scheduleTime} htmlFor="announcement-scheduled-at" error={form.formState.errors.scheduledAt?.message} hint={t.timezoneHint}><input id="announcement-scheduled-at" type="datetime-local" className={inputClassName} {...form.register('scheduledAt')} /></Field><p className="text-sm text-muted-foreground">{t.scheduleDescription}</p><FormActions pending={mutation.isPending} onCancel={onClose} submitLabel={t.schedule} /></form></Modal>;
}
