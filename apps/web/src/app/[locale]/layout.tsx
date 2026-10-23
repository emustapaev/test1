import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, locales } from '@/i18n/config';
import { getMessages } from '@/i18n/getMessages';
import { inter, manrope } from '../fonts';
import '@/styles/globals.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  if (!isLocale(params.locale)) return {};
  const { meta } = await getMessages(params.locale);
  return { title: meta.title, description: meta.description };
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) notFound();
  return (
    <html lang={params.locale} className={`${inter.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
