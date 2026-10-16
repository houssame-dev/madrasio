import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { getCatalog } from '@/i18n/catalogs';

export function EnglishTestMessages({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC">{children}</NextIntlClientProvider>;
}

/** Keep existing English interaction assertions under the real production message contract. */
export function renderWithEnglish(ui: ReactElement, options?: RenderOptions) {
  return render(<EnglishTestMessages>{ui}</EnglishTestMessages>, options);
}
