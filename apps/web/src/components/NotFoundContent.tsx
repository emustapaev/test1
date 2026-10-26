'use client';

import { useEffect, useState } from 'react';
import { defaultLocale, isLocale, type Locale } from '@/i18n/config';
import type { Messages } from '@/i18n/getMessages';

type Props = {
  initialLocale: Locale;
  texts: Record<Locale, Messages['notFound']>;
};

// CloudFront отдаёт один /404.html для всех путей, поэтому
// локаль уточняется по префиксу location.pathname; фолбэк — defaultLocale.
export default function NotFoundContent({ initialLocale, texts }: Props) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    const segment = window.location.pathname.split('/')[1] ?? '';
    const detected = isLocale(segment) ? segment : defaultLocale;
    setLocale(detected);
    document.documentElement.lang = detected;
  }, []);

  const t = texts[locale];
  return (
    <main>
      <h1>{t.title}</h1>
      <p>{t.description}</p>
      <a href={`/${locale}/`}>{t.home}</a>
    </main>
  );
}
