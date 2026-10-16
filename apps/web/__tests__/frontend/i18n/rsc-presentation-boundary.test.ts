// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sites = [
  '(app)/academic/page.tsx', '(app)/attendance/page.tsx', '(app)/grades/page.tsx',
  '(app)/grades/[id]/page.tsx', '(app)/grades/results/page.tsx', '(app)/homework/page.tsx', '(app)/homework/[id]/page.tsx',
  '(app)/teachers/page.tsx', '(app)/teachers/[id]/page.tsx',
  '(app)/students/page.tsx', '(app)/students/[id]/page.tsx',
  '(app)/parents/page.tsx', '(app)/parents/[id]/page.tsx',
  '(app)/children/[studentId]/page.tsx', '(app)/notifications/page.tsx',
  '(app)/announcements/page.tsx', '(app)/announcements/[id]/page.tsx', '(app)/announcements/inbox/page.tsx',
  'platform/layout.tsx', 'login/page.tsx', 'auth/recover/page.tsx', 'auth/set-password/page.tsx',
];
describe('descendant RSC presentation contract', () => {
  it.each(sites)('%s cannot independently resolve translated UI for another request preference', (site) => {
    const source = readFileSync(resolve(__dirname, '../../../app', site), 'utf8');
    expect(source).not.toMatch(/next-intl\/server|\bgetTranslations\s*\(|\bgetMessages\s*\(|\bgetLocale\s*\(/);
    expect(source).not.toMatch(/^['"]use client['"]/m);
    expect(source).not.toMatch(/frontend\/[^'"\n]+\/copy/);
  });
});
