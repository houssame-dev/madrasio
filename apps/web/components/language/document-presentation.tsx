'use client';

import { useState, type ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { localeDirection, type SupportedLocale } from '@school/shared';
import { getCatalog } from '@/i18n/catalogs';
import { Providers } from '@/app/providers';
import { THEME_INIT_SCRIPT } from '@/lib/frontend/theme';

/**
 * One presentation per mounted document, never a preference authority. Owning
 * html and intl together prevents refresh props from updating only one of them.
 * A full document load creates a new instance. Do not key this by locale/path.
 * Actual Next hydration, root preservation and BFCache still require proof.
 */
export function DocumentPresentation({ initialLocale, children }: { initialLocale: SupportedLocale; children: ReactNode }) {
  const [snapshot] = useState(() => ({ locale: initialLocale, messages: getCatalog(initialLocale) }));
  return (
    <html lang={snapshot.locale} dir={localeDirection(snapshot.locale)} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <script id="madrasio-theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <NextIntlClientProvider locale={snapshot.locale} messages={snapshot.messages} timeZone="UTC">
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
