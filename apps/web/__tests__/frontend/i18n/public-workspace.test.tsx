import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCatalog } from '@/i18n/catalogs';
import { localeDirection, type SupportedLocale } from '@school/shared';
import { LoginForm } from '@/components/auth/login-form';
import { RecoveryForm } from '@/components/auth/recovery-form';
import { SetPasswordForm } from '@/components/auth/set-password-form';
import { SchoolSelectionPanel } from '@/components/app/school-selector';
import { Dashboard } from '@/components/app/dashboard';
import { AppContextProvider } from '@/components/app/app-context';
import { FormActions, Modal, Pagination } from '@/components/academic/ui';
import type { MeResponseDto } from '@/lib/api/me';

const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), updateUser: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: () => ({ auth }) }));
vi.mock('@/components/dashboard/teacher-operational-dashboard', () => ({ TeacherOperationalDashboard: () => <p>Teacher branch</p> }));
vi.mock('@/components/parent/parent-dashboard', () => ({ ParentDashboard: () => <p>Parent branch</p> }));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.clearAllMocks(); });

function localized(locale: SupportedLocale, children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">
    <QueryClientProvider client={client}><div dir={localeDirection(locale)}>{children}</div></QueryClientProvider>
  </NextIntlClientProvider>);
}

const labels = [
  ['en', 'Sign in', 'Email address', 'Password', 'Choose a school', 'Your school workspace'],
  ['fr', 'Se connecter', 'Adresse e-mail', 'Mot de passe', 'Choisir un établissement', 'Votre espace scolaire'],
  ['ar', 'تسجيل الدخول', 'البريد الإلكتروني', 'كلمة المرور', 'اختيار مدرسة', 'مساحة العمل المدرسية'],
] as const;

describe('public and workspace localization source contracts', () => {
  it.each(labels)('renders %s login and localized validation without contacting Auth', async (locale, signIn, email, password) => {
    localized(locale, <LoginForm />);
    expect(screen.getByRole('heading', { name: signIn })).toBeInTheDocument();
    expect(screen.getByLabelText(email)).toHaveAttribute('dir', 'ltr');
    expect(screen.getByLabelText(password)).toHaveAttribute('autocomplete', 'current-password');
    await userEvent.click(screen.getByRole('button', { name: signIn }));
    expect(await screen.findByText(getCatalog(locale).validation.emailRequired)).toBeInTheDocument();
    expect(screen.getByText(getCatalog(locale).validation.passwordRequired)).toBeInTheDocument();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it.each(labels)('localizes %s recovery and password controls with the same validation rules', async (locale) => {
    const messages = getCatalog(locale);
    const view = localized(locale, <RecoveryForm />);
    await userEvent.click(screen.getByRole('button', { name: messages.recovery.submit }));
    expect(await screen.findByText(messages.validation.emailInvalid)).toBeInTheDocument();
    view.unmount();
    localized(locale, <SetPasswordForm />);
    await userEvent.type(screen.getByLabelText(messages.password.newPassword), 'short');
    await userEvent.type(screen.getByLabelText(messages.password.confirmation), 'different');
    await userEvent.click(screen.getByRole('button', { name: messages.password.submit }));
    expect(await screen.findByText(messages.validation.passwordShort)).toBeInTheDocument();
    expect(screen.getByText(messages.validation.passwordMismatch)).toBeInTheDocument();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each(labels)('preserves %s user-provided school names and translates role labels', (locale, _signIn, _email, _password, school) => {
    localized(locale, <SchoolSelectionPanel memberships={[{ schoolId: 'one', schoolName: 'Atlas مدرسة', role: 'TEACHER', status: 'ACTIVE' }]} />);
    expect(screen.getByRole('heading', { name: school })).toBeInTheDocument();
    expect(screen.getByText('Atlas مدرسة').tagName).toBe('BDI');
    expect(screen.getByText(getCatalog(locale).shell.roles.teacher)).toBeInTheDocument();
  });

  it.each(labels)('preserves %s dashboard role branching', (locale, _signIn, _email, _password, _school, heading) => {
    const context: MeResponseDto = { user: { id: 'owner' }, currentSchool: { id: 'school', role: 'SCHOOL_ADMIN', timezone: 'UTC' }, memberships: [] };
    const view = localized(locale, <AppContextProvider value={context}><Dashboard /></AppContextProvider>);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    view.unmount();
    for (const role of ['TEACHER', 'PARENT'] as const) {
      const branch = localized(locale, <AppContextProvider value={{ ...context, currentSchool: { id: 'school', role, timezone: 'UTC' } }}><Dashboard /></AppContextProvider>);
      expect(screen.getByText(role === 'TEACHER' ? 'Teacher branch' : 'Parent branch')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();
      branch.unmount();
    }
  });

  it.each(labels)('keeps %s dialog dismissal, form actions and pagination accessible', async (locale) => {
    const close = vi.fn();
    const page = vi.fn();
    localized(locale, <><Modal open title="Caller title" onClose={close}><FormActions pending={false} onCancel={close} /></Modal><Pagination page={1} pageSize={10} total={20} onPage={page} /></>);
    const messages = getCatalog(locale);
    expect(screen.getByRole('dialog', { name: 'Caller title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages.foundation.actions.save })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages.collection.previous })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: messages.collection.next }));
    expect(page).toHaveBeenCalledWith(2);
    await userEvent.keyboard('{Escape}');
    expect(close).toHaveBeenCalled();
  });
});
