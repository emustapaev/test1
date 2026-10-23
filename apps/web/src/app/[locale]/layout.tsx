import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, locales } from '@/i18n/config';
import { getMessages } from '@/i18n/getMessages';
import { SITE_URL, languageAlternates, localeUrl, ogLocales } from '@/i18n/seo';
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
  const locale = params.locale;
  return {
    metadataBase: new URL(SITE_URL),
    title: meta.title,
    description: meta.description,
    alternates: { canonical: localeUrl(locale), languages: languageAlternates() },
    openGraph: {
      type: 'website',
      url: localeUrl(locale),
      title: meta.ogTitle,
      description: meta.ogDescription,
      locale: ogLocales[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => ogLocales[l]),
      images: [{ url: '/og.png', alt: meta.ogImageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.ogTitle,
      description: meta.ogDescription,
      images: [{ url: '/og.png', alt: meta.ogImageAlt }],
    },
  };
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
