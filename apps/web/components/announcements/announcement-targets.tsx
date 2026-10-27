'use client';
import { useAnnouncementCopy } from '@/i18n/use-delivery-copy';
import { useDeliveryText } from '@/i18n/use-delivery-text';
import { useTranslations } from 'next-intl';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@school/ui';
import {
  ConfirmDialog,
  Field,
  InlineFeedback,
  SectionHeader,
  selectClassName,
} from '@/components/academic/ui';
import { announcementsApi } from '@/lib/frontend/announcements/api';
import {
  announcementErrorMessage,
  mapAnnouncementValidation,
} from '@/lib/frontend/announcements/errors';
import { invalidateAnnouncement } from '@/lib/frontend/announcements/mutations';
import { announcementKeys } from '@/lib/frontend/announcements/queries';
import {
  announcementAudiences,
  announcementTargetSchema,
  type AnnouncementTargetValues,
} from '@/lib/frontend/announcements/schemas';
import type { AnnouncementVersionDto } from '@/lib/frontend/announcements/types';
import type { AcademicYearDto, ClassDto } from '@/lib/frontend/academic/types';

export function AnnouncementTargets({
  schoolId,
  announcementId,
  version,
  years,
  classes,
  teacherClassIds,
  editable,
}: {
  schoolId: string;
  announcementId: string;
  version: AnnouncementVersionDto;
  years: AcademicYearDto[];
  classes: ClassDto[];
  teacherClassIds?: Set<string>;
  editable: boolean;
}) {
  const t = useAnnouncementCopy();
  const ui = useTranslations('communicationUi');
  const [notice, setNotice] = useState(false);
  const text = useDeliveryText();
  const msg = useTranslations();
  const [removeId, setRemoveId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const query = useQuery({
    queryKey: announcementKeys.targets(schoolId, announcementId, version.id),
    queryFn: () => announcementsApi.targets(announcementId, version.id),
  });
  const form = useForm<AnnouncementTargetValues>({
    resolver: zodResolver(announcementTargetSchema),
    defaultValues: { audience: 'PARENTS', targetType: 'CLASS', academicYearId: '', classId: '' },
  });
  const targetType = form.watch('targetType');
  const yearId = form.watch('academicYearId');
  const eligibleYears = years.filter((year) => year.status === 'ACTIVE');
  const eligibleClasses = classes.filter(
    (item) =>
      item.status === 'ACTIVE' &&
      (!yearId || item.academicYearId === yearId) &&
      (!teacherClassIds || teacherClassIds.has(item.id)),
  );
  const duplicate = query.data?.some(
    (target) =>
      target.audience === form.watch('audience') &&
      target.targetType === targetType &&
      target.academicYearId === yearId &&
      (targetType === 'SCHOOL' || target.classId === form.watch('classId')),
  );
  const mutation = useMutation({
    mutationFn: (value: AnnouncementTargetValues) =>
      announcementsApi.addTargets(announcementId, version.id, [
        {
          audience: value.audience,
          targetType: value.targetType,
          academicYearId: value.academicYearId,
          ...(value.targetType === 'CLASS' ? { classId: value.classId } : {}),
        },
      ]),
    onSuccess: async () => {
      await invalidateAnnouncement(queryClient, schoolId, announcementId, {
        list: true,
        targets: true,
      });
      setError(undefined);
      setNotice(true);
    },
    onError: (value) => {
      if (!mapAnnouncementValidation(value, form.setError))
        setError(text(announcementErrorMessage(value)));
    },
  });
  const removal = useMutation({
    mutationFn: (targetId: string) =>
      announcementsApi.removeTarget(announcementId, version.id, targetId),
    onSuccess: async () => {
      await invalidateAnnouncement(queryClient, schoolId, announcementId, {
        list: true,
        targets: true,
      });
      setRemoveId(null);
    },
  });
  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <SectionHeader
        title={t.targets}
        description={teacherClassIds ? t.teacherScope : t.targetHint}
      />
      {error ? (
        <InlineFeedback brand kind="error">
          {text(error)}
        </InlineFeedback>
      ) : null}
      {editable ? <p className="text-sm leading-6 text-muted-foreground">{ui('steps')}</p> : null}
      {notice ? (
        <InlineFeedback brand kind="success">
          {ui('targetsSaved')}
        </InlineFeedback>
      ) : null}
      {query.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {ui('targetsLoading')}
        </p>
      ) : query.isError ? (
        <InlineFeedback brand kind="error">
          {ui('targetsUnavailable')}{' '}
          <Button type="button" variant="outline" onClick={() => void query.refetch()}>
            {ui('retry')}
          </Button>
        </InlineFeedback>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2">
        {query.data?.map((target) => {
          const className = target.classId
            ? (classes.find((item) => item.id === target.classId)?.name ?? t.class)
            : t.wholeSchool;
          return (
            <li
              key={target.id}
              className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-3 text-sm break-words"
            >
              <span className="font-medium">{text(target.audience)}</span>
              <span className="text-muted-foreground">·</span>
              {text(target.targetType)}:{' '}
              <bdi className="min-w-0 max-w-full break-words">{className}</bdi>
              <span className="text-muted-foreground">
                <bdi>
                  {years.find((year) => year.id === target.academicYearId)?.name ?? t.academicYear}
                </bdi>{' '}
                · v{version.versionNumber}
              </span>
              {editable ? (
                <Button
                  type="button"
                  variant="outline"
                  className="ms-auto shrink-0"
                  onClick={() => {
                    removal.reset();
                    setRemoveId(target.id);
                  }}
                  aria-label={msg('deliveryUi.removeTargetLabel', {
                    audience: text(target.audience),
                    className,
                  })}
                >
                  {text('Remove')}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {query.isSuccess && query.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.noTargets}</p>
      ) : null}
      {editable ? (
        <form
          className="grid gap-3 border-t pt-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((value) => {
            setNotice(false);
            setError(undefined);
            mutation.mutate(value);
          })}
        >
          <Field
            label={t.audience}
            htmlFor="announcement-audience"
            error={text(form.formState.errors.audience?.message)}
          >
            <select
              id="announcement-audience"
              className={selectClassName}
              {...form.register('audience')}
            >
              {announcementAudiences.map((item) => (
                <option key={item} value={item}>
                  {text(item)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t.targetType}
            htmlFor="announcement-target-type"
            error={text(form.formState.errors.targetType?.message)}
          >
            <select
              id="announcement-target-type"
              className={selectClassName}
              {...form.register('targetType', { onChange: () => form.setValue('classId', '') })}
            >
              {teacherClassIds ? (
                <option value="CLASS">{text('CLASS')}</option>
              ) : (
                <>
                  <option value="CLASS">{text('CLASS')}</option>
                  <option value="SCHOOL">{text('SCHOOL')}</option>
                </>
              )}
            </select>
          </Field>
          <Field
            label={t.academicYear}
            htmlFor="announcement-year"
            error={text(form.formState.errors.academicYearId?.message)}
          >
            <select
              id="announcement-year"
              className={selectClassName}
              {...form.register('academicYearId', { onChange: () => form.setValue('classId', '') })}
            >
              <option value="">{t.selectYear}</option>
              {eligibleYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          </Field>
          {targetType === 'CLASS' ? (
            <Field
              label={t.class}
              htmlFor="announcement-class"
              error={text(form.formState.errors.classId?.message)}
            >
              <select
                id="announcement-class"
                className={selectClassName}
                disabled={!yearId}
                {...form.register('classId')}
              >
                <option value="">{t.selectClass}</option>
                {eligibleClasses.map((item) => (
                  <option key={item.id} value={item.id} dir="auto">
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <input type="hidden" {...form.register('classId')} />
          )}
          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={mutation.isPending || query.isPending || query.isError || duplicate}
            >
              {t.addTarget}
            </Button>
          </div>
        </form>
      ) : null}
      <ConfirmDialog
        open={!!removeId}
        title={text('Remove this target?')}
        description={`${text('Only this unpublished Version is affected.')} v${version.versionNumber} · ${text(query.data?.find((target) => target.id === removeId)?.audience ?? '')} · ${classes.find((item) => item.id === query.data?.find((target) => target.id === removeId)?.classId)?.name ?? t.wholeSchool}`}
        pending={removal.isPending}
        error={removal.isError ? text(announcementErrorMessage(removal.error)) : undefined}
        onClose={() => {
          if (!removal.isPending) setRemoveId(null);
        }}
        onConfirm={() => {
          if (removeId && !removal.isPending) removal.mutate(removeId);
        }}
      />
    </section>
  );
}
