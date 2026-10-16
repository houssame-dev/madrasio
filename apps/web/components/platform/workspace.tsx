'use client';
import { useDeliveryText } from '@/i18n/use-delivery-text';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@school/ui';
import { PageContainer } from '@/components/ui/page-container';
import { AccessDeniedState, ApiErrorState, PageLoading } from '@/components/ui/states';
import {
  Field,
  FormActions,
  InlineFeedback,
  inputClassName,
  Pagination,
  StatusBadge,
} from '@/components/academic/ui';
import { schoolInput, adminInput, type AdminSummary } from '@/lib/modules/platform/contracts';
import { platformApi, platformKeys } from '@/lib/frontend/platform';
import { ApiClientError } from '@/lib/frontend/api-client';

function failure(error: unknown) {
  if (error instanceof ApiClientError && error.featureCode === 'ACCOUNT_ROLE_CONFLICT')
    return 'This account has a different role in this School.';
  if (
    error instanceof ApiClientError &&
    error.featureCode === 'ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED'
  )
    return 'Operator reconciliation is required. Do not retry the invitation.';
  if (
    error instanceof ApiClientError &&
    error.featureCode === 'ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED'
  )
    return 'Account identity needs operator reconciliation.';
  return 'The action could not be completed. Check the account state before retrying.';
}
function ReadFailure({ error }: { error: unknown }) {
  const text = useDeliveryText();
  return error instanceof ApiClientError && [401, 403].includes(error.status) ? (
    <AccessDeniedState description={text("Platform administration is not available for this account.")} />
  ) : (
    <ApiErrorState />
  );
}
export function CreateSchoolForm({
  onSaved,
  onCancel,
}: {
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const text = useDeliveryText();
  const form = useForm<{ name: string; timezone: string }>({
    resolver: zodResolver(schoolInput),
    defaultValues: { name: '', timezone: 'UTC' },
  });
  const mutation = useMutation({
    mutationFn: platformApi.create,
    onSuccess: onSaved,
    retry: false,
  });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((input) => {
        if (!mutation.isPending) mutation.mutate(input);
      })}
    >
      <h2 className="text-lg font-semibold">{text("Create School")}</h2>
      {mutation.isError ? (
        <InlineFeedback kind="error">{text(failure(mutation.error))}</InlineFeedback>
      ) : null}
      <Field
        label={text("School name")}
        htmlFor="school-name"
        required
        error={text(form.formState.errors.name?.message)}
      >
        <input
          id="school-name" dir="auto"
          className={inputClassName}
          aria-invalid={!!form.formState.errors.name}
          {...form.register('name')}
        />
      </Field>
      <Field
        label={text("Timezone")}
        htmlFor="school-timezone"
        required
        error={text(form.formState.errors.timezone?.message)}
      >
        <input
          id="school-timezone"
          dir="ltr"
          className={inputClassName}
          aria-invalid={!!form.formState.errors.timezone}
          {...form.register('timezone')}
        />
      </Field>
      <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel={text("Create School")} />
    </form>
  );
}
export function PlatformSchools() {
  const text = useDeliveryText();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(false);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [...platformKeys.schools, page],
    queryFn: () => platformApi.list(page),
  });
  if (query.isPending) return <PageLoading />;
  if (query.isError) return <ReadFailure error={query.error} />;
  return (
    <PageContainer variant="MANAGEMENT_WIDE" className="space-y-6">
      <h1 className="text-2xl font-semibold">{text("Platform Schools")}</h1>
      {success ? (
        <InlineFeedback kind="success">{text("School created. Add School Admins from its management page.")}</InlineFeedback>
      ) : null}
      {creating ? (
        <PageContainer variant="FORM_DETAIL">
          <CreateSchoolForm
            onCancel={() => setCreating(false)}
            onSaved={async () => {
              await client.invalidateQueries({ queryKey: platformKeys.schools });
              setCreating(false);
              setSuccess(true);
            }}
          />
        </PageContainer>
      ) : (
        <Button onClick={() => setCreating(true)}>{text("Create School")}</Button>
      )}
      {query.data.data.length === 0 ? (
        <p>{text("No Schools yet.")}</p>
      ) : (
        <ul className="grid gap-4">
          {query.data.data.map((school) => (
            <li key={school.id} className="min-w-0 break-words rounded border p-4">
              <Link className="font-medium underline" href={`/platform/schools/${school.id}`}>
                <bdi>{school.name}</bdi>
              </Link>{' '}
              <StatusBadge status={school.status} label={text(school.status)} />
              <p><bdi dir="ltr">{school.timezone}</bdi></p>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageSize={50} total={query.data.meta.total} onPage={setPage} />
    </PageContainer>
  );
}
function AdminStatus({ admin, schoolId }: { admin: AdminSummary; schoolId: string }) {
  const text = useDeliveryText();
  const msg = useTranslations();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      platformApi.status(schoolId, admin.id, admin.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'),
    onSuccess: () => client.invalidateQueries({ queryKey: platformKeys.admins(schoolId) }),
    retry: false,
  });
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={
          mutation.isPending || (admin.status === 'INACTIVE' && admin.userStatus !== 'ACTIVE')
        }
        onClick={() => mutation.mutate()}
        aria-label={msg('platformUi.adminAction', { action: text(admin.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'), email: admin.email })}
      >
        {text(mutation.isPending ? 'Saving…' : admin.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate')}
      </Button>
      {mutation.isSuccess ? (
        <InlineFeedback kind="success">{text("Membership updated.")}</InlineFeedback>
      ) : null}
      {mutation.isError ? (
        <InlineFeedback kind="error">{text(failure(mutation.error))}</InlineFeedback>
      ) : null}
    </div>
  );
}
export function AddAdminForm({ schoolId }: { schoolId: string }) {
  const text = useDeliveryText();
  const client = useQueryClient();
  const form = useForm<{ email: string }>({
    resolver: zodResolver(adminInput),
    defaultValues: { email: '' },
  });
  const mutation = useMutation({
    mutationFn: (input: { email: string }) => platformApi.invite(schoolId, input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: platformKeys.admins(schoolId) });
      form.reset();
    },
    retry: false,
  });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((input) => {
        if (!mutation.isPending) mutation.mutate(input);
      })}
    >
      <h2 className="text-lg font-semibold">{text("Add School Admin")}</h2>
      <p>{text("Existing accounts are linked; new accounts receive an invitation. Passwords are never chosen here.")}</p>
      <Field
        label={text("Admin email")}
        htmlFor="admin-email"
        required
        error={text(form.formState.errors.email?.message)}
      >
        <input
          id="admin-email"
          dir="ltr"
          type="email"
          autoComplete="email"
          className={inputClassName}
          aria-invalid={!!form.formState.errors.email}
          {...form.register('email')}
        />
      </Field>
      <Button type="submit" disabled={mutation.isPending}>
        {text(mutation.isPending ? 'Saving…' : 'Invite or link Admin')}
      </Button>
      {mutation.isSuccess ? (
        <InlineFeedback kind="success">
          {mutation.data.state === 'INVITED'
            ? text('Invitation initiated.')
            : text('School Admin account linked.')}
        </InlineFeedback>
      ) : null}
      {mutation.isError ? (
        <InlineFeedback kind="error">{text(failure(mutation.error))}</InlineFeedback>
      ) : null}
    </form>
  );
}
export function PlatformSchool({ schoolId }: { schoolId: string }) {
  const text = useDeliveryText();
  const msg = useTranslations();
  const school = useQuery({
    queryKey: platformKeys.school(schoolId),
    queryFn: () => platformApi.school(schoolId),
  });
  const admins = useQuery({
    queryKey: platformKeys.admins(schoolId),
    queryFn: () => platformApi.admins(schoolId),
  });
  if (school.isPending || admins.isPending) return <PageLoading />;
  if (school.isError || admins.isError) return <ReadFailure error={school.error ?? admins.error} />;
  return (
    <PageContainer variant="MANAGEMENT_WIDE" className="space-y-6">
      <h1 className="text-2xl font-semibold"><bdi>{school.data.name}</bdi></h1>
      <p>
        <bdi dir="ltr">{school.data.timezone}</bdi> — <StatusBadge status={school.data.status} label={text(school.data.status)} />
      </p>
      <h2 className="text-xl font-semibold">{text("School Admin memberships")}</h2>
      <p>{text("Deactivation affects only this School, including when this is its last active Admin.")}</p>
      {admins.data.length === 0 ? (
        <p>{text("No School Admin memberships.")}</p>
      ) : (
        <ul className="grid gap-4">
          {admins.data.map((admin) => (
            <li
              className="flex flex-wrap items-center justify-between gap-4 rounded border p-4"
              key={admin.id}
            >
              <div className="min-w-0 break-words">
                <p><bdi dir="ltr">{admin.email}</bdi></p>
                <StatusBadge status={admin.status} label={text(admin.status)} />
                <p>{msg('platformUi.accountStatus', { status: text(admin.userStatus) })}</p>
              </div>
              <AdminStatus admin={admin} schoolId={schoolId} />
            </li>
          ))}
        </ul>
      )}
      {school.data.status === 'ACTIVE' ? (
        <PageContainer variant="FORM_DETAIL">
          <AddAdminForm schoolId={schoolId} />
        </PageContainer>
      ) : (
        <p>{text("Reactivate the School through an approved operator process before adding Admins.")}</p>
      )}
      <p>
        {text('For expired invitations or password recovery, use the existing')}{' '}
        <Link className="underline" href="/auth/recover">{text("account-recovery flow")}</Link>{text('. Do not recreate accounts.')}</p>
    </PageContainer>
  );
}
