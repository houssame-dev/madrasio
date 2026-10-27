import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localeDirection, type SupportedLocale } from '@school/shared';
import { AppShell } from '@/components/app/app-shell';
import { getCatalog } from '@/i18n/catalogs';
import type { MeResponseDto } from '@/lib/api/me';
import type { Role } from '@/lib/authorization/roles';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/dashboard' }));

const clients: QueryClient[] = [];

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input) === '/api/v1/notifications/unread-count') {
      return Response.json({ data: { count: 0 } });
    }
    if (String(input) === '/api/v1/dashboard/context') return Response.json({ data: { date: '2026-10-24', timezone: 'UTC', academicYear: { id: 'year-1', name: '2026/2027' } } });
    throw new Error('Unexpected request in shell regression');
  });
});

afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.restoreAllMocks();
  router.replace.mockReset();
  router.refresh.mockReset();
});

function schoolContext(role: Role = 'SCHOOL_ADMIN'): MeResponseDto {
  return {
    user: { id: 'shell-test-user' },
    currentSchool: { id: 'shell-test-school', role, timezone: 'UTC' },
    memberships: [{ schoolId: 'shell-test-school', schoolName: 'Caller School', role, status: 'ACTIVE' }],
  };
}

function renderShell(locale: SupportedLocale = 'en', context = schoolContext()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">
    <QueryClientProvider client={client}>
      <div dir={localeDirection(locale)}><AppShell context={context}><h1>Caller content</h1></AppShell></div>
    </QueryClientProvider>
  </NextIntlClientProvider>);
}

type ShellLabels = [
  locale: SupportedLocale, open: string, close: string, collapse: string, expand: string,
  currentSchool: string, superAdmin: string, schoolAdmin: string, teacher: string, parent: string, landmark: string,
];
const labels: ShellLabels[] = [
  ['en', 'Open navigation', 'Close navigation', 'Collapse navigation', 'Expand navigation', 'Current school', 'Super administrator', 'School administrator', 'Teacher', 'Parent', 'Main navigation'],
  ['fr', 'Ouvrir la navigation', 'Fermer la navigation', 'Réduire la navigation', 'Développer la navigation', 'Établissement actuel', 'Super administrateur', 'Administrateur de l’établissement', 'Enseignant', 'Parent', 'Navigation principale'],
  ['ar', 'فتح قائمة التنقل', 'إغلاق قائمة التنقل', 'طي قائمة التنقل', 'توسيع قائمة التنقل', 'المدرسة الحالية', 'المسؤول العام', 'مسؤول المدرسة', 'معلم', 'ولي أمر', 'التنقل الرئيسي'],
];

describe('localized application shell', () => {
  it.each(labels)('keeps one localized Announcements entry in desktop and mobile navigation in %s', async (locale, open) => {
    const user = userEvent.setup();
    const label = getCatalog(locale).navigation.items.announcements;
    for (const role of ['SCHOOL_ADMIN', 'TEACHER', 'PARENT'] as const) {
      const view = renderShell(locale, schoolContext(role));
      const href = role === 'PARENT' ? '/announcements/inbox' : '/announcements';
      const desktop = within(screen.getByTestId('desktop-sidebar'));
      expect(desktop.getAllByRole('link', { name: label })).toHaveLength(1);
      expect(desktop.getByRole('link', { name: label })).toHaveAttribute('href', href);
      const trigger = screen.getByRole('button', { name: open });
      await user.click(trigger);
      const dialog = within(screen.getByRole('dialog'));
      expect(dialog.getAllByRole('link', { name: label })).toHaveLength(1);
      const destination = dialog.getByRole('link', { name: label });
      expect(destination).toHaveAttribute('href', href);
      destination.addEventListener('click', event => event.preventDefault(), { once: true });
      await user.click(destination);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      view.unmount();
    }
  });

  it.each(labels)('preserves %s sidebar and mobile control behavior', async (
    locale, open, close, collapse, expand, currentSchool, superAdmin, schoolAdmin,
    teacher, parent, landmark,
  ) => {
    const user = userEvent.setup();
    const view = renderShell(locale, { ...schoolContext(), memberships: [] });
    const sidebar = screen.getByTestId('desktop-sidebar');
    expect(sidebar).toHaveClass('lg:flex', 'start-0', 'border-e', 'w-[var(--app-sidebar-width)]');
    expect(within(sidebar).getByRole('img', { name: 'Madrasio' })).toHaveAttribute('data-brand', 'wordmark');
    expect(within(sidebar).getByRole('navigation', { name: landmark })).toBeInTheDocument();
    expect(screen.queryByText(currentSchool)).not.toBeInTheDocument();
    expect(screen.getAllByText(schoolAdmin)).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Caller content' })).toBeInTheDocument();
    const toggle = within(sidebar).getByRole('button', { name: collapse });
    expect(toggle.querySelector('svg')).toHaveClass('rtl:rotate-180');
    expect(toggle).toHaveAttribute('type', 'button');
    await user.click(toggle);
    expect(sidebar).toHaveClass('w-[var(--app-sidebar-collapsed-width)]');
    expect(within(sidebar).getByRole('button', { name: expand })).toBe(toggle);
    expect(within(sidebar).getByRole('img', { name: 'Madrasio' })).toHaveAttribute('data-brand', 'logo');
    await user.click(toggle);
    expect(within(sidebar).getByRole('button', { name: collapse })).toBe(toggle);
    expect(sidebar).toHaveClass('w-[var(--app-sidebar-width)]');
    expect(within(sidebar).getByRole('img', { name: 'Madrasio' })).toHaveAttribute('data-brand', 'wordmark');

    const trigger = screen.getByRole('button', { name: open });
    expect(trigger).toHaveClass('lg:hidden');
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: landmark });
    expect(dialog).toHaveClass('start-0', 'inset-y-0');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const scrollRegion = within(dialog).getByTestId('drawer-scroll-region');
    expect(scrollRegion).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'overscroll-contain');
    expect(scrollRegion).toContainElement(within(dialog).getByRole('navigation', { name: landmark }));
    expect(within(scrollRegion).getAllByRole('link')).toHaveLength(13);
    expect(dialog).toHaveClass('w-[min(20rem,85vw)]');
    expect(within(dialog).getByRole('img', { name: 'Madrasio' })).toHaveAttribute('data-brand', 'wordmark');
    expect(document.body.style.overflow).toBe('hidden');
    expect(trigger.closest('[aria-hidden="true"]')).not.toBeNull();
    const dismiss = within(dialog).getByRole('button', { name: close });
    expect(dismiss).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getAllByRole('link').at(-1)).toHaveFocus();
    await user.tab();
    expect(dismiss).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: close }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    const overlay = view.container.querySelector<HTMLButtonElement>('button.absolute.inset-0');
    expect(overlay).toHaveAccessibleName(close);
    if (!overlay) throw new Error('Missing mobile navigation overlay');
    await user.click(overlay);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    view.unmount();
    for (const [role, label] of [
      ['SUPER_ADMIN', superAdmin], ['SCHOOL_ADMIN', schoolAdmin],
      ['TEACHER', teacher], ['PARENT', parent],
    ] as const) {
      const roleView = renderShell(locale, schoolContext(role));
      expect(screen.getAllByText(label)).toHaveLength(1);
      expect(screen.queryByText('Caller School')).not.toBeInTheDocument();
      roleView.unmount();
    }
  });

  it('includes Parent timetable access and closes mobile navigation after route selection', async () => {
    const user = userEvent.setup();
    renderShell('en', schoolContext('PARENT'));
    const sidebar = screen.getByTestId('desktop-sidebar');
    expect(within(sidebar).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/dashboard', '/timetable', '/children', '/announcements/inbox', '/notifications',
    ]);
    expect(within(sidebar).queryByRole('link', { name: 'Platform Schools' })).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(trigger);
    const destination = within(screen.getByRole('dialog')).getByRole('link', { name: 'Notifications' });
    destination.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await user.click(destination);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('preserves explicit platform authority independently of the School role', () => {
    const context = schoolContext('PARENT');
    renderShell('en', { ...context, platformAuthority: 'SUPER_ADMIN' });
    expect(within(screen.getByTestId('desktop-sidebar')).getByRole('link', { name: 'Platform Schools' }))
      .toHaveAttribute('href', '/platform/schools');
  });

  it('keeps exactly thirteen School Admin links and preserves dual platform authority in the profile', async () => {
    renderShell('en', { ...schoolContext(), platformAuthority: 'SUPER_ADMIN' });
    expect(within(screen.getByTestId('desktop-sidebar')).getAllByRole('link')).toHaveLength(13);
    await userEvent.click(screen.getByRole('button', { name: getCatalog('en').application.profile }));
    expect(within(await screen.findByRole('dialog', { name: getCatalog('en').application.profile })).getByRole('link', { name: 'Platform Schools' })).toHaveAttribute('href', '/platform/schools');
  });

  it('keeps an empty supplied School name and renders no shell without currentSchool', () => {
    const context = schoolContext();
    context.memberships[0].schoolName = '';
    const view = renderShell('fr', context);
    expect(screen.queryByText('Établissement actuel')).not.toBeInTheDocument();
    view.unmount();
    const absent = renderShell('ar', { ...context, currentSchool: null });
    const wrapper = absent.container.firstElementChild;
    expect(wrapper).toHaveAttribute('dir', 'rtl');
    expect(wrapper).toBeEmptyDOMElement();
    expect(absent.container.querySelector('nav, header, aside, main, [role="navigation"], [role="dialog"]')).toBeNull();
    expect(screen.queryByText('Caller content')).not.toBeInTheDocument();
  });
});
