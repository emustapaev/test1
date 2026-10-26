import type { Metadata } from 'next';
import { defaultLocale, locales, type Locale } from '@/i18n/config';
import { getMessages, type Messages } from '@/i18n/getMessages';
import NotFoundContent from '@/components/NotFoundContent';
import { inter, manrope } from './fonts';
import '@/styles/globals.css';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Статическая /404.html: CloudFront отдаёт её для любых несуществующих путей,
// локаль уточняется на клиенте по префиксу пути.
export default async function RootNotFound() {
  const entries = await Promise.all(
    locales.map(async (l) => [l, (await getMessages(l)).notFound] as const),
  );
  const texts = Object.fromEntries(entries) as Record<Locale, Messages['notFound']>;
  return (
    <html lang={defaultLocale} className={`${inter.variable} ${manrope.variable}`}>
      <body>
        <NotFoundContent initialLocale={defaultLocale} texts={texts} />
      </body>
    </html>
  );
}
