'use client';

import { Building2 } from 'lucide-react';

import type { MeMembershipDto } from '@/lib/api/me';
import { useTranslations } from 'next-intl';

import { useSelectCurrentSchool } from '@/lib/frontend/current-user';
import { Button } from '@school/ui';
import { LogoutButton } from '@/components/auth/logout-button';
import { LanguagePreferenceSlot } from '@/components/language/preference-slot';

const roleKeys = { SUPER_ADMIN: 'roles.superAdmin', SCHOOL_ADMIN: 'roles.schoolAdmin', TEACHER: 'roles.teacher', PARENT: 'roles.parent' } as const;

export function SchoolSelectionPanel({ memberships }: { memberships: readonly MeMembershipDto[] }) {
  const t = useTranslations('workspace');
  const roles = useTranslations('shell');
  const errors = useTranslations('states.error');
  const selection = useSelectCurrentSchool();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <section className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-sm" aria-labelledby="school-selection-title">
        <div className="mb-6 flex items-start gap-3">
          <span className="rounded-md bg-primary p-2 text-primary-foreground" aria-hidden="true"><Building2 className="size-5" /></span>
          <div>
            <h1 id="school-selection-title" className="text-xl font-semibold">{t('chooseSchool')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('chooseSchoolDescription')}</p>
          </div>
        </div>
        <LanguagePreferenceSlot placement="school-selection" />
        <div className="grid gap-3">
          {memberships.map((membership) => (
            <Button
              key={membership.schoolId}
              type="button"
              variant="outline"
              className="h-auto justify-between px-4 py-3 text-start"
              disabled={selection.isPending}
              onClick={() => selection.mutate(membership.schoolId)}
            >
              <span className="truncate font-medium"><bdi>{membership.schoolName}</bdi></span>
              <span className="text-xs font-normal text-muted-foreground">{roles(roleKeys[membership.role])}</span>
            </Button>
          ))}
        </div>
        {selection.isPending ? <p className="mt-4 text-sm text-muted-foreground" role="status">{t('switchingSchool')}</p> : null}
        {selection.isError ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {errors('description')}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end border-t pt-4"><LogoutButton /></div>
      </section>
    </main>
  );
}

export function SchoolSwitcher({ memberships, currentSchoolId }: { memberships: readonly MeMembershipDto[]; currentSchoolId: string }) {
  const t = useTranslations('workspace');
  const errors = useTranslations('states.error');
  const selection = useSelectCurrentSchool();

  if (memberships.length < 2) return null;

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <label>
        <span className="sr-only">{t('switchSchool')}</span>
        <select
          aria-label={t('switchSchool')}
          value={currentSchoolId}
          disabled={selection.isPending}
          onChange={(event) => selection.mutate(event.target.value)}
          className="w-28 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:max-w-48"
        >
          {memberships.map((membership) => <option key={membership.schoolId} value={membership.schoolId}>{membership.schoolName}</option>)}
        </select>
      </label>
      {selection.isPending ? <span className="sr-only" role="status">{t('switchingSchool')}</span> : null}
      {selection.isError ? <span className="sr-only" role="alert">{errors('description')}</span> : null}
    </div>
  );
}
