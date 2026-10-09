'use client';
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
  return error instanceof ApiClientError && [401, 403].includes(error.status) ? (
    <AccessDeniedState description="Platform administration is not available for this account." />
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
      <h2 className="text-lg font-semibold">Create School</h2>
      {mutation.isError ? (
        <InlineFeedback kind="error">{failure(mutation.error)}</InlineFeedback>
      ) : null}
      <Field
        label="School name"
        htmlFor="school-name"
        required
        error={form.formState.errors.name?.message}
      >
        <input
          id="school-name"
          className={inputClassName}
          aria-invalid={!!form.formState.errors.name}
          {...form.register('name')}
        />
      </Field>
      <Field
        label="Timezone"
        htmlFor="school-timezone"
        required
        error={form.formState.errors.timezone?.message}
      >
        <input
          id="school-timezone"
          className={inputClassName}
          aria-invalid={!!form.formState.errors.timezone}
          {...form.register('timezone')}
        />
      </Field>
      <FormActions pending={mutation.isPending} onCancel={onCancel} submitLabel="Create School" />
    </form>
  );
}
export function PlatformSchools() {
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
      <h1 className="text-2xl font-semibold">Platform Schools</h1>
      {success ? (
        <InlineFeedback kind="success">
          School created. Add School Admins from its management page.
        </InlineFeedback>
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
        <Button onClick={() => setCreating(true)}>Create School</Button>
      )}
      {query.data.data.length === 0 ? (
        <p>No Schools yet.</p>
      ) : (
        <ul className="grid gap-4">
          {query.data.data.map((school) => (
            <li key={school.id} className="rounded border p-4">
              <Link className="font-medium underline" href={`/platform/schools/${school.id}`}>
                {school.name}
              </Link>{' '}
              <StatusBadge status={school.status} />
              <p>{school.timezone}</p>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageSize={50} total={query.data.meta.total} onPage={setPage} />
    </PageContainer>
  );
}
function AdminStatus({ admin, schoolId }: { admin: AdminSummary; schoolId: string }) {
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
        aria-label={`${admin.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'} ${admin.email}`}
      >
        {mutation.isPending ? 'Saving…' : admin.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
      </Button>
      {mutation.isSuccess ? (
        <InlineFeedback kind="success">Membership updated.</InlineFeedback>
      ) : null}
      {mutation.isError ? (
        <InlineFeedback kind="error">{failure(mutation.error)}</InlineFeedback>
      ) : null}
    </div>
  );
}
export function AddAdminForm({ schoolId }: { schoolId: string }) {
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
      <h2 className="text-lg font-semibold">Add School Admin</h2>
      <p>
        Existing accounts are linked; new accounts receive an invitation. Passwords are never chosen
        here.
      </p>
      <Field
        label="Admin email"
        htmlFor="admin-email"
        required
        error={form.formState.errors.email?.message}
      >
        <input
          id="admin-email"
          type="email"
          autoComplete="email"
          className={inputClassName}
          aria-invalid={!!form.formState.errors.email}
          {...form.register('email')}
        />
      </Field>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Invite or link Admin'}
      </Button>
      {mutation.isSuccess ? (
        <InlineFeedback kind="success">
          {mutation.data.state === 'INVITED'
            ? 'Invitation initiated.'
            : 'School Admin account linked.'}
        </InlineFeedback>
      ) : null}
      {mutation.isError ? (
        <InlineFeedback kind="error">{failure(mutation.error)}</InlineFeedback>
      ) : null}
    </form>
  );
}
export function PlatformSchool({ schoolId }: { schoolId: string }) {
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
      <h1 className="text-2xl font-semibold">{school.data.name}</h1>
      <p>
        {school.data.timezone} — <StatusBadge status={school.data.status} />
      </p>
      <h2 className="text-xl font-semibold">School Admin memberships</h2>
      <p>Deactivation affects only this School, including when this is its last active Admin.</p>
      {admins.data.length === 0 ? (
        <p>No School Admin memberships.</p>
      ) : (
        <ul className="grid gap-4">
          {admins.data.map((admin) => (
            <li
              className="flex flex-wrap items-center justify-between gap-4 rounded border p-4"
              key={admin.id}
            >
              <div>
                <p>{admin.email}</p>
                <StatusBadge status={admin.status} />
                <p>Account: {admin.userStatus}</p>
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
        <p>Reactivate the School through an approved operator process before adding Admins.</p>
      )}
      <p>
        For expired invitations or password recovery, use the existing{' '}
        <Link className="underline" href="/auth/recover">
          account-recovery flow
        </Link>
        . Do not recreate accounts.
      </p>
    </PageContainer>
  );
}
