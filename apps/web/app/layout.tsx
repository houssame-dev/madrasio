import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { DocumentPresentation } from '@/components/language/document-presentation';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Madrasio',
    template: '%s · Madrasio',
  },
  description: 'Multi-tenant school management SaaS foundation.',
  icons: {
    icon: [
      { url: '/brand/favicon-light.png', type: 'image/png', sizes: '32x32', media: '(prefers-color-scheme: light)' },
      { url: '/brand/favicon-dark.png', type: 'image/png', sizes: '32x32', media: '(prefers-color-scheme: dark)' },
      { url: '/brand/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/brand/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return <DocumentPresentation initialLocale={locale}>{children}</DocumentPresentation>;
}
