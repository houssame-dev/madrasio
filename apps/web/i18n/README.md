# Task 066 A1 multilingual foundation

`@school/shared` owns supported locales, validation, English fallback and direction.
`catalogs.ts` selects only static EN/FR/AR catalogs; English defines the key schema.
`types.d.ts` augments next-intl for typed locale, namespace, key and ICU arguments.

The next-intl plugin connects `request.ts` to Server Component APIs, including
`await getTranslations('foundation')`. The root layout forwards request locale
and messages into one `NextIntlClientProvider`, around the existing Query provider.
Client Components can use `useTranslations('foundation')`. For example:
`t('greeting', { name: userDisplayName })`. Use normal text rendering for user
values; do not insert translated strings as HTML. ICU plurals can be added later.

A1 always resolves English and renders `lang=en`, `dir=ltr`. French and Arabic
catalogs are independently usable in tests, not selectable application languages
yet. No middleware, locale URL segments, storage, cookies or selection UI is added.
Existing feature copy remains English and has not been migrated to next-intl.

Task 066_04 owns authenticated per-user persistence, switching and request-specific
document language/direction. Keep School business-time formatting separate from
UI language: locale changes must not change persisted dates, instants or scores.
Manual A2 validation gates are intentionally not run during A1 implementation.
