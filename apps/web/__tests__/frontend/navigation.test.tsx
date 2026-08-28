import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NavigationLinks } from '@/components/app/navigation-links';
import { AppContextProvider } from '@/components/app/app-context';
import { FeaturePlaceholder } from '@/components/app/feature-placeholder';
import { visibleNavigationItems } from '@/lib/frontend/navigation';

const navigation = vi.hoisted(() => ({ pathname: '/students' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

beforeEach(() => { navigation.pathname = '/students'; });

describe('role-aware navigation', () => {
  it('shows the full school administrator foundation', () => {
    const labels = visibleNavigationItems('SCHOOL_ADMIN').map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'Academic Structure', 'Students', 'Teachers', 'Parents', 'Grades & Results', 'Attendance', 'Homework', 'Announcements', 'Notifications']));
    expect(labels).not.toContain('Children');
  });

  it('keeps teacher navigation free of administrator directories', () => {
    const labels = visibleNavigationItems('TEACHER').map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(['Students', 'Teachers', 'Grades & Results', 'Attendance', 'Homework', 'Announcements', 'Notifications']));
    expect(labels).not.toEqual(expect.arrayContaining(['Academic Structure', 'Parents']));
  });

  it('gives parents a child-facing route and no administration routes', () => {
    const labels = visibleNavigationItems('PARENT').map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'Children', 'Grades & Results', 'Notifications']));
    expect(labels).not.toEqual(expect.arrayContaining(['Students', 'Teachers', 'Parents', 'Academic Structure', 'Homework', 'Announcements']));
  });

  it('marks the exact active route', () => {
    render(<NavigationLinks role="SCHOOL_ADMIN" />);
    expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('renders a safe denied state for a directly visited unavailable section', () => {
    render(
      <AppContextProvider value={{ user: { id: 'user' }, currentSchool: { id: 'school', role: 'PARENT' }, memberships: [] }}>
        <FeaturePlaceholder title="Students" permission="students.read" roles={['SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER']} />
      </AppContextProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument();
    expect(screen.queryByText('UI implementation is coming in a later task.')).not.toBeInTheDocument();
  });
});
