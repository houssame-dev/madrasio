import type { NextConfig } from 'next';
import { securityHeaders, privateResponseHeaders } from './lib/config/security-headers';

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
    ];
  },
};

export default nextConfig;
