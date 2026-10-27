'use client';
import { useAnnouncementCopy } from '@/i18n/use-delivery-copy';
import { useDeliveryText } from '@/i18n/use-delivery-text';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { schoolWallTimeToInstant } from '@school/shared';
import { useAppContext } from '@/components/app/app-context';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import {
  Field,
  FormActions,
  InlineFeedback,
  Modal,
  inputClassName,
} from '@/components/academic/ui';
import { announcementsApi } from '@/lib/frontend/announcements/api';
import {
  announcementErrorMessage,
  mapAnnouncementValidation,
} from '@/lib/frontend/announcements/errors';
import { invalidateAnnouncement } from '@/lib/frontend/announcements/mutations';
import {
  announcementScheduleSchema,
  type AnnouncementScheduleValues,
} from '@/lib/frontend/announcements/schemas';

export function AnnouncementScheduleDialog({
  open,
  schoolId,
  announcementId,
  versionId,
  publicationId,
  review,
  blocked = false,
  onClose,
}: {
  open: boolean;
  schoolId: string;
  announcementId: string;
  versionId: string;
  publicationId?: string;
  review?: ReactNode;
  blocked?: boolean;
  onClose: () => void;
}) {
  const t = useAnnouncementCopy();
  const text = useDeliveryText();
  const timezone = useAppContext().currentSchool!.timezone;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const form = useForm<AnnouncementScheduleValues>({
    resolver: zodResolver(announcementScheduleSchema(timezone)),
    defaultValues: { scheduledAt: '' },
  });
  const mutation = useMutation({
    mutationFn: (value: AnnouncementScheduleValues) =>
      publicationId
        ? announcementsApi.reschedule(
            announcementId,
            publicationId,
            schoolWallTimeToInstant(value.scheduledAt, timezone),
          )
        : announcementsApi.publish(
            announcementId,
            versionId,
            schoolWallTimeToInstant(value.scheduledAt, timezone),
          ),
    onSuccess: async () => {
      await invalidateAnnouncement(queryClient, schoolId, announcementId, {
        list: true,
        publications: true,
      });
      onClose();
    },
    onError: (value) => {
      if (!mapAnnouncementValidation(value, form.setError))
        setError(text(announcementErrorMessage(value)));
    },
  });
  return (
    <Modal
      open={open}
      title={publicationId ? text('Reschedule publication') : t.scheduleTitle}
      description={t.scheduleDescription}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <form
        className="cm-workspace cm-form space-y-4"
        noValidate
        onSubmit={form.handleSubmit((value) => {
          if (!mutation.isPending && !blocked) mutation.mutate(value);
        })}
      >
        {review}
        {error ? (
          <InlineFeedback brand kind="error">
            {text(error)}
          </InlineFeedback>
        ) : null}
        <Field
          label={t.scheduleTime}
          htmlFor="announcement-scheduled-at"
          error={text(form.formState.errors.scheduledAt?.message)}
          hint={`${t.timezoneHint} (\u2066${timezone}\u2069)`}
        >
          <input
            id="announcement-scheduled-at"
            type="datetime-local"
            dir="ltr"
            className={inputClassName}
            {...form.register('scheduledAt')}
          />
        </Field>
        <p className="text-sm text-muted-foreground">{t.scheduleDescription}</p>
        <fieldset disabled={blocked || mutation.isPending}>
          <FormActions
            pending={mutation.isPending}
            onCancel={onClose}
            submitLabel={publicationId ? text('Reschedule') : t.schedule}
          />
        </fieldset>
      </form>
    </Modal>
  );
}
