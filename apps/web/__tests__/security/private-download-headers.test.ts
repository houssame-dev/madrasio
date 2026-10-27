import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { privateDownloadHeaders, securityHeaders } from '@/lib/config/security-headers';

describe('final private download HTTP policy', () => {
  it('overrides the general CSP only on the three authorized private-download routes', async () => {
    const rules = await nextConfig.headers!();
    const downloads = rules.filter(rule => rule.source.endsWith('/download'));
    expect(downloads.map(rule => rule.source)).toEqual([
      '/api/v1/announcements/:id/versions/:versionId/attachments/:attachmentId/download',
      '/api/v1/me/announcements/:id/attachments/:attachmentId/download',
      '/api/v1/homework-submissions/:id/attachments/:attachmentId/download',
    ]);
    expect(downloads.every(rule => rules.indexOf(rule) > rules.findIndex(item => item.source === '/:path*'))).toBe(true);
    for (const rule of downloads) expect(rule.headers).toEqual(privateDownloadHeaders);
    expect(privateDownloadHeaders[0].value).toBe("default-src 'none'; sandbox; frame-ancestors 'none'");
    expect(rules.find(rule => rule.source === '/:path*')?.headers).toEqual(securityHeaders);
  });
});
