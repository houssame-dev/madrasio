import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { DEFAULT_LOCALE, localeDirection } from '@school/shared';
import { Providers } from '@/app/providers';
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
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html lang={DEFAULT_LOCALE} dir={localeDirection(DEFAULT_LOCALE)} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
