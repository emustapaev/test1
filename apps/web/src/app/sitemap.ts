import type { MetadataRoute } from 'next';
import { locales } from '@/i18n/config';
import { languageAlternates, localeUrl } from '@/i18n/seo';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = languageAlternates();
  return locales.map((locale) => ({
    url: localeUrl(locale),
    alternates: { languages },
  }));
}
