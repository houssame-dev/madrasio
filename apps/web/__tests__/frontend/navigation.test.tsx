import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { getCatalog } from '@/i18n/catalogs';
import type { SupportedLocale } from '@school/shared';

import { NavigationLinks } from '@/components/app/navigation-links';
import { AppContextProvider } from '@/components/app/app-context';
import { FeaturePlaceholder } from '@/components/app/feature-placeholder';
import { visibleNavigationItems } from '@/lib/frontend/navigation';

const navigation = vi.hoisted(() => ({ pathname: '/students' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

beforeEach(() => { navigation.pathname = '/students'; });

function renderNavigation(ui: ReactNode, locale: SupportedLocale = 'en') {
  return render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">{ui}</NextIntlClientProvider>);
}

describe('role-aware navigation', () => {
  it('shows the full school administrator foundation', () => {
    const labels = visibleNavigationItems('SCHOOL_ADMIN').map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(['Finance', 'Dashboard', 'Academic Structure', 'Students', 'Teachers', 'Parents', 'Grades', 'Results', 'Attendance', 'Homework', 'Announcements', 'Notifications']));
    expect(labels).not.toContain('Children');
  });

  it('does not grant Finance navigation to other roles or platform authority', () => {
    for (const role of ['SUPER_ADMIN', 'TEACHER', 'PARENT'] as const) {
      expect(visibleNavigationItems(role).map(item => item.href)).not.toContain('/finance');
    }
  });

  it('keeps teacher navigation free of administrator directories', () => {
    const labels = visibleNavigationItems('TEACHER').map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(['Students', 'Teachers', 'Grades', 'Results', 'Attendance', 'Homework', 'Announcements', 'Notifications']));
    expect(labels).not.toEqual(expect.arrayContaining(['Academic Structure', 'Parents']));
  });

  it('gives parents a child-facing route and no administration routes', () => {
    const labels = visibleNavigationItems('PARENT').map((item) => item.label);
    expect(labels).toEqual([
     'Dashboard',
     'Timetable',
     'My Children',
     'Announcements',
     'Notifications',
   ]);
    expect(labels).not.toEqual(expect.arrayContaining(['Students', 'Teachers', 'Parents', 'Academic Structure', 'Grades', 'Results', 'Attendance', 'Homework']));
  });

  it('marks the exact active route', () => {
    renderNavigation(<NavigationLinks role="SCHOOL_ADMIN" />);
    expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('renders a safe denied state for a directly visited unavailable section', () => {
    renderNavigation(
      <AppContextProvider value={{ user: { id: 'user' }, currentSchool: { id: 'school', role: 'PARENT', timezone: 'UTC' }, memberships: [] }}>
        <FeaturePlaceholder title="Students" permission="students.read" roles={['SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER']} />
      </AppContextProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument();
    expect(screen.queryByText('UI implementation is coming in a later task.')).not.toBeInTheDocument();
  });
});

describe('localized navigation presentation', () => {
  it.each(['en', 'fr', 'ar'] as const)('unifies Announcements destinations and nested active states in %s', (locale) => {
    const label = getCatalog(locale).navigation.items.announcements;
    for (const role of ['SCHOOL_ADMIN', 'TEACHER', 'PARENT'] as const) {
      const href = role === 'PARENT' ? '/announcements/inbox' : '/announcements';
      expect(visibleNavigationItems(role).filter(item => item.labelKey === 'announcements')).toHaveLength(1);
      for (const path of role === 'PARENT'
        ? ['/announcements/inbox', '/announcements/inbox/publication-id']
        : ['/announcements', '/announcements/announcement-id', '/announcements/inbox', '/announcements/inbox/publication-id']) {
        for (const collapsed of [false, true]) {
          navigation.pathname = path;
          const onNavigate = vi.fn();
          const view = renderNavigation(<NavigationLinks role={role} collapsed={collapsed} onNavigate={onNavigate} />, locale);
          const links = screen.getAllByRole('link').filter(link => link.getAttribute('href')?.startsWith('/announcements'));
          expect(links).toHaveLength(1);
          const link = screen.getByRole('link', { name: label });
          expect(link).toHaveAttribute('href', href);
          expect(link).toHaveAttribute('aria-current', 'page');
          link.click();
          expect(onNavigate).toHaveBeenCalledOnce();
          view.unmount();
        }
      }
    }
  });

  it.each([
    ['en', 'Grades', 'Results'],
    ['fr', 'Notes', 'Résultats'],
    ['ar', 'الدرجات', 'النتائج'],
  ] as const)('separates consecutive staff workspaces and active states in %s', (locale, grades, results) => {
    for (const role of ['SCHOOL_ADMIN', 'TEACHER'] as const) {
      navigation.pathname = '/results';
      const view = renderNavigation(<NavigationLinks role={role} />, locale);
      const links = screen.getAllByRole('link');
      const gradesLink = screen.getByRole('link', { name: grades });
      const resultsLink = screen.getByRole('link', { name: results });
      expect(gradesLink).toHaveAttribute('href', '/grades');
      expect(resultsLink).toHaveAttribute('href', '/results');
      expect(links.indexOf(resultsLink)).toBe(links.indexOf(gradesLink) + 1);
      expect(resultsLink).toHaveAttribute('aria-current', 'page');
      expect(gradesLink).not.toHaveAttribute('aria-current');
      navigation.pathname = '/grades/configuration';
      view.rerender(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC"><NavigationLinks role={role} /></NextIntlClientProvider>);
      expect(gradesLink).toHaveAttribute('aria-current', 'page');
      expect(resultsLink).not.toHaveAttribute('aria-current');
      view.unmount();
    }
  });

  it.each([
    ['en', 'Main navigation', 'Students', 'Platform Schools'],
    ['fr', 'Navigation principale', 'Élèves', 'Établissements de la plateforme'],
    ['ar', 'التنقل الرئيسي', 'الطلاب', 'مدارس المنصة'],
  ] as const)('uses %s labels for visible links, collapsed names and platform navigation', (locale, landmark, students, platformSchools) => {
    const onNavigate = vi.fn();
    const view = renderNavigation(<NavigationLinks role="SCHOOL_ADMIN" platformAuthority="SUPER_ADMIN" onNavigate={onNavigate} />, locale);
    expect(screen.getByRole('navigation', { name: landmark })).toBeInTheDocument();
    const studentLink = screen.getByRole('link', { name: students });
    expect(studentLink).toHaveAttribute('href', '/students');
    expect(studentLink).toHaveAttribute('aria-current', 'page');
    expect(studentLink).not.toHaveAttribute('title');
    expect(studentLink).toHaveTextContent(students);
    studentLink.click();
    expect(onNavigate).toHaveBeenCalledOnce();
    // School Admin keeps the approved thirteen-link sidebar; platform access lives in its profile menu.
    expect(screen.queryByRole('link', { name: platformSchools })).not.toBeInTheDocument();

    view.rerender(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">
      <NavigationLinks role="SCHOOL_ADMIN" collapsed />
    </NextIntlClientProvider>);
    const collapsedLink = screen.getByRole('link', { name: students });
    expect(collapsedLink).toHaveAttribute('title', students);
    expect(collapsedLink.querySelector('.sr-only')).toHaveTextContent(students);
    expect(collapsedLink.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('link', { name: platformSchools })).not.toBeInTheDocument();
    view.rerender(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">
      <NavigationLinks role="TEACHER" platformAuthority="SUPER_ADMIN" />
    </NextIntlClientProvider>);
    expect(screen.getByRole('link', { name: platformSchools })).toHaveAttribute('href', '/platform/schools');
  });

  it.each(['en', 'fr', 'ar'] as const)('preserves Parent destinations and ordering in %s', (locale) => {
    renderNavigation(<NavigationLinks role="PARENT" />, locale);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/dashboard', '/timetable', '/children', '/announcements/inbox', '/notifications',
    ]);
  });

  it('retains the provider missing-message contract rather than substituting an English label', () => {
    const onError = vi.fn();
    render(<NextIntlClientProvider locale="en" messages={{ navigation: { landmark: 'Main navigation', items: {} } }} timeZone="UTC" onError={onError}>
      <NavigationLinks role="SCHOOL_ADMIN" />
    </NextIntlClientProvider>);
    expect(screen.getByRole('link', { name: 'navigation.items.students' })).toHaveAttribute('href', '/students');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'MISSING_MESSAGE' }));
  });
});
