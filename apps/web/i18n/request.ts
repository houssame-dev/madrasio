import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { getCatalog } from './catalogs';
import { cookieLocale, LOCALE_COOKIE } from './locale-cookie';

export default getRequestConfig(async () => {
  const locale = cookieLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return { locale, messages: getCatalog(locale), timeZone: 'UTC' };
});
