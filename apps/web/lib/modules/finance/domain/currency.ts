import { z } from 'zod';

// Adding a currency requires a two-decimal ISO currency and a forward migration
// extending the matching database checks. No currency conversion is supported.
export const FINANCE_CURRENCIES = ['MAD', 'EUR', 'USD', 'GBP'] as const;
export const financeCurrencySchema = z.enum(FINANCE_CURRENCIES);
export type FinanceCurrency = z.infer<typeof financeCurrencySchema>;
export const currencySettingsSchema = z.object({ currency: financeCurrencySchema }).strict();
