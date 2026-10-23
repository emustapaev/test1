import { defaultLocale, locales, type Locale } from './config';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://krunai.uz').replace(/\/+$/, '');

export const ogLocales: Record<Locale, string> = { en: 'en_US', ru: 'ru_RU' };

export function localeUrl(locale: Locale): string {
  return `${SITE_URL}/${locale}/`;
}

/** hreflang → URL для всех локалей + x-default. */
export function languageAlternates(): Record<string, string> {
  return {
    ...Object.fromEntries(locales.map((l) => [l, localeUrl(l)])),
    'x-default': localeUrl(defaultLocale),
  };
}
