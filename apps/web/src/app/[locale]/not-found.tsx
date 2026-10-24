import type { Metadata } from 'next';
import { locales, type Locale } from '@/i18n/config';
import { getMessages, type Messages } from '@/i18n/getMessages';
import NotFoundContent from '@/components/NotFoundContent';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: {},
};

// Локаль берётся из префикса пути в NotFoundContent (RU для /ru/..., иначе EN).
export default async function LocaleNotFound() {
  const entries = await Promise.all(
    locales.map(async (l) => [l, (await getMessages(l)).notFound] as const),
  );
  const texts = Object.fromEntries(entries) as Record<Locale, Messages['notFound']>;
  return <NotFoundContent initialLocale="en" texts={texts} />;
}
