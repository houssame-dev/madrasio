'use client';
import { Popover } from '@base-ui/react/popover';
import { DirectionProvider } from '@base-ui/react/direction-provider';
import { ChevronDown, Globe2, Palette } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { MeResponseDto } from '@/lib/api/me';
import { apiRequest } from '@/lib/frontend/api-client';
import type { WorkspaceContext } from '@/lib/frontend/dashboard/admin-types';
import { LanguagePreferenceSlot } from '@/components/language/preference-slot';
import { ThemeSelector } from '@/components/theme/theme-selector';
import { LogoutButton } from '@/components/auth/logout-button';
import { SchoolSwitcher } from './school-selector';

const roleKeys = { SUPER_ADMIN: 'roles.superAdmin', SCHOOL_ADMIN: 'roles.schoolAdmin', TEACHER: 'roles.teacher', PARENT: 'roles.parent' } as const;
export function ProfileMenu({ context }: { context: MeResponseDto }) {
  const t = useTranslations('application'), shell = useTranslations('shell'), theme = useTranslations('theme'), language = useTranslations('languagePreference');
  const locale = useLocale(), current = context.currentSchool!;
  const navigation = useTranslations('navigation.items');
  const school = context.memberships.find(m => m.schoolId === current.id);
  const name = school?.schoolName ?? shell('currentSchool');
  const role = shell(roleKeys[current.role]);
  const initial = [...role].filter(c => /\p{L}/u.test(c)).slice(0, 2).join('');
  const academic = useQuery({ queryKey: ['workspace-context', current.id], queryFn: async () => (await apiRequest<{ data: WorkspaceContext }>('/api/v1/dashboard/context')).data, staleTime: 60_000 });
  return <DirectionProvider direction={locale === 'ar' ? 'rtl' : 'ltr'}><Popover.Root>
    <Popover.Trigger className="ws-profile-trigger" aria-label={t('profile')}>
      <span className="ws-avatar" aria-hidden="true">{initial}</span>
      <span className="ws-profile-identity"><strong>{role}</strong><span>Madrasio</span></span>
      <ChevronDown className="size-4" aria-hidden="true" />
    </Popover.Trigger>
    <Popover.Portal><Popover.Positioner sideOffset={10} align="end" className="z-50">
      <Popover.Popup className="madrasio-workspace ws-profile" aria-label={t('profile')}>
        <div className="ws-school-identity"><span className="ws-school-avatar" aria-hidden="true">{[...name.trim()][0]}</span><div><strong><bdi>{name}</bdi></strong><p>{academic.isPending ? t('loadingContext') : academic.isError ? t('contextError') : academic.data?.academicYear?.name ?? t('noYear')}</p></div></div>
        {context.memberships.length > 1 ? <div className="ws-switcher"><SchoolSwitcher memberships={context.memberships} currentSchoolId={current.id} /></div> : null}
        {context.platformAuthority === 'SUPER_ADMIN' && current.role === 'SCHOOL_ADMIN' ? <Link href="/platform/schools" className="my-3 block rounded-md border p-3 text-sm">{navigation('platformSchools')}</Link> : null}
        <div className="ws-preference"><Globe2 aria-hidden="true" /><span>{language('label')}</span><LanguagePreferenceSlot placement="app-shell" /></div>
        <div className="ws-preference"><Palette aria-hidden="true" /><span>{theme('label')}</span><ThemeSelector /></div>
        <div className="ws-logout"><LogoutButton variant="ghost" /></div>
      </Popover.Popup>
    </Popover.Positioner></Popover.Portal>
  </Popover.Root></DirectionProvider>;
}
