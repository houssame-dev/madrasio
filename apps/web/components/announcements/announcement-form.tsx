'use client';
import { useAnnouncementCopy } from '@/i18n/use-delivery-copy';
import { useDeliveryText } from '@/i18n/use-delivery-text';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AnnouncementBody } from './announcement-body';
import { Field, FormActions, InlineFeedback, inputClassName } from '@/components/academic/ui';
import { announcementsApi } from '@/lib/frontend/announcements/api';
import { announcementErrorMessage, mapAnnouncementValidation } from '@/lib/frontend/announcements/errors';
import { announcementKeys } from '@/lib/frontend/announcements/queries';
import { announcementContentSchema, type AnnouncementContentValues } from '@/lib/frontend/announcements/schemas';

export function AnnouncementForm({ schoolId, announcementId, initial, onCancel, onSaved }: { schoolId: string; announcementId?: string; initial?: AnnouncementContentValues; onCancel: () => void; onSaved?: () => void }) {
  const t = useAnnouncementCopy();
  const text = useDeliveryText();
  const router = useRouter(); const queryClient = useQueryClient(); const [error, setError] = useState<string>();
  const form = useForm<AnnouncementContentValues>({ resolver: zodResolver(announcementContentSchema), defaultValues: initial ?? { title: '', body: '' } });
  const mutation = useMutation({ mutationFn: async (values: AnnouncementContentValues) => { const input = { title: values.title.trim(), body: values.body.trim(), bodyFormat: values.bodyFormat ?? 'PLAIN_TEXT' }; if (announcementId) { await announcementsApi.createVersion(announcementId, input); return announcementId; } return (await announcementsApi.create(input)).announcement.id; }, onSuccess: async (id) => { if (announcementId) { await Promise.all([queryClient.invalidateQueries({ queryKey: announcementKeys.detail(schoolId, announcementId) }), queryClient.invalidateQueries({ queryKey: announcementKeys.versions(schoolId, announcementId) }), queryClient.invalidateQueries({ queryKey: announcementKeys.lists(schoolId) })]); onSaved?.(); } else { await queryClient.invalidateQueries({ queryKey: announcementKeys.lists(schoolId) }); router.push(`/announcements/${id}`); } }, onError: (value) => { if (!mapAnnouncementValidation(value, form.setError)) setError(text(announcementErrorMessage(value))); } });
  return <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => { setError(undefined); mutation.mutate(values); })}>{error ? <InlineFeedback kind="error">{text(error)}</InlineFeedback> : null}<Field label={t.titleField} htmlFor="announcement-title" error={text(form.formState.errors.title?.message)}><input id="announcement-title" dir="auto" className={inputClassName} {...form.register('title')} /></Field><Field label={text("Content format")} htmlFor="announcement-format"><select id="announcement-format" className={inputClassName} {...form.register('bodyFormat')}><option value="PLAIN_TEXT">{text("Plain text")}</option><option value="HTML">{text("Rich text (safe HTML)")}</option></select></Field><Field label={t.body} htmlFor="announcement-body" error={text(form.formState.errors.body?.message)} hint={t.plainText}><textarea id="announcement-body" dir="auto" className={`${inputClassName} min-h-44 py-2`} {...form.register('body')} /></Field><section aria-label={text("Sanitized content preview")} className="rounded border p-3"><h3>{text("Preview")}</h3><AnnouncementBody body={form.watch('body')} bodyFormat={form.watch('bodyFormat')} /></section><FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={announcementId ? t.saveVersion : t.create} /></form>;
}
