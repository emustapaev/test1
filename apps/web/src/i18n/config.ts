export const locales = ['en', 'ru'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export function isLocale(x: string): x is Locale {
  return (locales as readonly string[]).includes(x);
}
