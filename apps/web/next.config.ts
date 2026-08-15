import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // transpile workspace packages that ship raw TypeScript
  transpilePackages: ['@school/ui', '@school/shared', '@school/config', '@school/database'],
  // experimental: keep surface minimal; only enable what's needed
  typedRoutes: false,
};

export default nextConfig;
