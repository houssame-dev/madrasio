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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return <DocumentPresentation initialLocale={locale}>{children}</DocumentPresentation>;
}
