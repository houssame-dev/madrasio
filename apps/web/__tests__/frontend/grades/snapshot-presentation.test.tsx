import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import { getCatalog } from '@/i18n/catalogs';
import { Snapshot } from '@/components/grades/results/publication-snapshot';
import type { PublicationSnapshot } from '@/lib/frontend/grades/publications';

const value: PublicationSnapshot = { publicationId: 'publication', resultType: 'SUBJECT', value: '15.00', publicationVersion: 2, publishedAt: '2026-10-21T23:45:12.123Z', academicYearId: 'year', gradingConfigurationVersionId: 'historical-rule-version', displayContext: null, state: 'REVISED' };
afterEach(cleanup);
it.each(['en', 'fr', 'ar'] as const)('presents a localized UTC date and retains exact historical details in %s', async locale => {
  const copy = getCatalog(locale).communicationUi;
  render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="Pacific/Auckland"><Snapshot value={value} /></NextIntlClientProvider>);
  const time = document.querySelector('time')!;
  expect(time).toHaveAttribute('dateTime', value.publishedAt);
  expect(time).toHaveTextContent(new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value.publishedAt)));
  expect(screen.getByText(value.publishedAt)).not.toBeVisible();
  await userEvent.click(screen.getByText(copy.technicalDetails));
  expect(screen.getByText(value.publishedAt)).toBeVisible();
  expect(screen.getByText(/historical-rule-version/)).toBeVisible();
  expect(screen.getByText(/15.00/)).toBeInTheDocument();
});
