import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUPPORTED_LOCALES } from '@school/shared';
import { getCatalog } from '@/i18n/catalogs';
import { SearchInput } from '@/components/ui/search-input';

afterEach(cleanup);

describe('shared search localization', () => {
  it.each(SUPPORTED_LOCALES)('uses %s labels without changing the consumer placeholder or search callback', (locale) => {
    const messages = getCatalog(locale);
    const onSearch = vi.fn();
    render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <SearchInput id="student-search" label={messages.attendance.searchStudents} value="Synthetic" busy onSearch={onSearch} />
    </NextIntlClientProvider>);
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', messages.attendance.searchStudents);
    expect(screen.getByRole('button', { name: messages.academic.search })).toBeInTheDocument();
    expect(screen.getByText(messages.domainUi.searching)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: messages.domainUi.clearSearch }));
    expect(onSearch).toHaveBeenCalledWith(undefined);
  });
  it('preserves explicit consumer copy overrides', () => {
    render(<NextIntlClientProvider locale="ar" messages={getCatalog('ar')} timeZone="UTC">
      <SearchInput id="custom" label="Synthetic filter" onSearch={vi.fn()} copy={{ search: 'Custom find', clear: 'Custom clear', searching: 'Custom pending' }} />
    </NextIntlClientProvider>);
    expect(screen.getByRole('button', { name: 'Custom find' })).toBeInTheDocument();
  });
});
