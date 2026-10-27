import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { securityHeaders, privateResponseHeaders, privateDownloadHeaders } from './lib/config/security-headers';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep local production validation separate from an already running dev server.
  distDir: process.env.MADRASIO_ISOLATED_BUILD === '1' ? 'dist/dashboard-validation' : '.next',
  // transpile workspace packages that ship raw TypeScript
  transpilePackages: ['@school/ui', '@school/shared', '@school/config', '@school/database'],
  // experimental: keep surface minimal; only enable what's needed
  typedRoutes: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/api/:path*', headers: privateResponseHeaders },
      { source: '/auth/:path*', headers: privateResponseHeaders },
      { source: '/login', headers: privateResponseHeaders },
      ...[
        '/api/v1/announcements/:id/versions/:versionId/attachments/:attachmentId/download',
        '/api/v1/me/announcements/:id/attachments/:attachmentId/download',
        '/api/v1/homework-submissions/:id/attachments/:attachmentId/download',
      ].map((source) => ({ source, headers: privateDownloadHeaders })),
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
