import type { ComponentProps } from 'react';
import type { NextIntlClientProvider, useTranslations } from 'next-intl';
import type { getRequestConfig, getTranslations } from 'next-intl/server';
import type { CatalogMessages, Messages, getCatalog } from '@/i18n/catalogs';
import type en from '@/i18n/messages/en';
import type fr from '@/i18n/messages/fr';
import type ar from '@/i18n/messages/ar';

// Compile-only regression coverage, included by the existing web tsconfig.
// These constraints produce diagnostics if a forbidden call becomes valid;
// no invalid call, diagnostic suppression or runtime test execution is needed.
type Assert<Value extends true> = Value;
type Assignable<Source, Target> = [Source] extends [Target] ? true : false;
type Not<Value extends boolean> = Value extends true ? false : true;
// An interpolation map with no usable entries, rather than the broad {} type.
type EmptyInterpolationValues = Record<string, never>;

type ClientMessages = ComponentProps<typeof NextIntlClientProvider>['messages'];
type RequestFactory = Parameters<typeof getRequestConfig>[0];
type ServerMessages = Awaited<ReturnType<RequestFactory>>['messages'];
type ClientTranslator = ReturnType<typeof useTranslations<'foundation'>>;
type ServerTranslator = Awaited<ReturnType<typeof getTranslations<'foundation'>>>;

// Never called. Instantiation expressions specialize the real library call
// signatures; inferred return types retain their required ICU argument tuples.
// Exporting these helpers avoids unused value bindings in this compile-only file.
export function specializeClientGreeting(translator: ClientTranslator) {
  return translator<'greeting'>;
}

export function specializeServerGreeting(translator: ServerTranslator) {
  return translator<'greeting'>;
}

type ClientGreetingArgs = Parameters<ReturnType<typeof specializeClientGreeting>>;
type ServerGreetingArgs = Parameters<ReturnType<typeof specializeServerGreeting>>;
type ClientKeys = Parameters<ClientTranslator>[0];
type ServerKeys = Parameters<ServerTranslator>[0];
type Namespaces = Parameters<typeof useTranslations>[0];

export type CatalogTypeRegressionChecks = [
  Assert<Assignable<typeof en, Messages>>,
  Assert<Assignable<typeof fr, Messages>>,
  Assert<Assignable<typeof ar, Messages>>,
  Assert<Not<Assignable<Omit<typeof fr.foundation.actions, 'retry'>, Messages['foundation']['actions']>>>,
  Assert<Assignable<ReturnType<typeof getCatalog>, CatalogMessages>>,
  Assert<Assignable<ReturnType<typeof getCatalog>, ClientMessages>>,
  Assert<Assignable<ReturnType<typeof getCatalog>, ServerMessages>>,
  Assert<Assignable<typeof fr, ClientMessages>>,
  Assert<Assignable<typeof ar, ServerMessages>>,
  Assert<Not<Assignable<string, CatalogMessages['foundation']['greeting']>>>,
  Assert<Assignable<'foundation.actions', Namespaces>>,
  Assert<Not<Assignable<'unknownNamespace', Namespaces>>>,
  Assert<Assignable<'actions.save', ClientKeys>>,
  Assert<Assignable<'greeting', ServerKeys>>,
  Assert<Not<Assignable<'actions.unknown', ClientKeys>>>,
  Assert<Not<Assignable<'unknownKey', ServerKeys>>>,
  Assert<Assignable<['greeting', { name: string }], ClientGreetingArgs>>,
  Assert<Assignable<['greeting', { name: string }], ServerGreetingArgs>>,
  Assert<Not<Assignable<['greeting'], ClientGreetingArgs>>>,
  Assert<Not<Assignable<['greeting'], ServerGreetingArgs>>>,
  Assert<Not<Assignable<['greeting', EmptyInterpolationValues], ClientGreetingArgs>>>,
  Assert<Not<Assignable<['greeting', { wrongName: string }], ServerGreetingArgs>>>,
  Assert<Not<Assignable<['greeting', { name: number }], ClientGreetingArgs>>>,
  Assert<Not<Assignable<['greeting', { name: number }], ServerGreetingArgs>>>,
];
