# Task 066 multilingual V1

`@school/shared` owns supported locales, validation, English fallback and direction.
`catalogs.ts` selects only static EN/FR/AR catalogs; English defines the key schema.
`types.d.ts` augments next-intl for typed locale, namespace, key and ICU arguments.

The next-intl plugin connects `request.ts` to Server Component APIs, including
`await getTranslations('foundation')`. The root layout forwards request locale
and messages into one `NextIntlClientProvider`, around the existing Query provider.
Client Components can use `useTranslations('foundation')`. For example:
`t('greeting', { name: userDisplayName })`. Use normal text rendering for user
values; do not insert translated strings as HTML. ICU plurals can be added later.

`request.ts` reads the validated host-only `MADRASIO_LOCALE` cookie, falling back
to English. The selector supports English, Français and العربية, for anonymous
and authenticated pages. A Next Server Action validates and saves a year-long
HttpOnly, SameSite=Lax cookie (Secure in production), then the client reloads the
full document. Existing paths are unchanged. Arabic renders `lang=ar`, `dir=rtl`.
No database preference, migration, remote synchronization or router interceptor
is involved. Legacy prepared account/navigation modules are not wired into this
flow. The cookie is a browser presentation preference, never Auth/tenant authority.

UTC is the UI formatting fallback. Keep School business-time formatting separate:
locale changes must not change persisted dates, instants, scores or school zones.
