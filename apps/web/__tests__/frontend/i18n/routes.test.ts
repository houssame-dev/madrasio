import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { navigationItems, isActiveNavigationPath } from '@/lib/frontend/navigation';

describe('unprefixed application routing', () => {
  it('preserves existing navigation paths', () => {
    expect(navigationItems.map((item) => item.href)).toEqual([
      '/dashboard', '/finance', '/timetable', '/academic', '/students', '/children', '/teachers', '/parents',
      '/grades', '/attendance', '/homework', '/announcements', '/announcements/inbox', '/notifications',
    ]);
    expect(isActiveNavigationPath('/students/student-id', '/students')).toBe(true);
    expect(isActiveNavigationPath('/announcements/inbox', '/announcements')).toBe(false);
  });

  it('retains auth/platform entries and adds no locale segments or middleware', () => {
    const web = resolve(__dirname, '../../..');
    for (const entry of ['login/page.tsx', 'auth/confirm/route.ts', 'platform/layout.tsx', '(app)/layout.tsx']) {
      expect(existsSync(resolve(web, 'app', entry))).toBe(true);
    }
    expect(readdirSync(resolve(web, 'app'))).not.toContain('[locale]');
    for (const entry of ['middleware.ts', 'middleware.js', 'proxy.ts', 'proxy.js']) {
      expect(existsSync(resolve(web, entry))).toBe(false);
    }
  });
});
