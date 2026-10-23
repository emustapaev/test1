'use client';

import type { MouseEvent } from 'react';
import { locales, type Locale } from '@/i18n/config';

type Labels = { label: string } & Record<Locale, string>;

const MAX_AGE = 31536000;

export function LanguageSwitcher({ currentLocale, labels }: { currentLocale: Locale; labels: Labels }) {
  function onClick(e: MouseEvent<HTMLAnchorElement>, locale: Locale) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    document.cookie = `lang=${locale}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax; Secure`;
    window.location.assign(`/${locale}/${window.location.search}${window.location.hash}`);
  }

  return (
    <div className="lang" role="group" aria-label={labels.label}>
      {locales.map((locale) => (
        <a
          key={locale}
          href={`/${locale}/`}
          hrefLang={locale}
          lang={locale}
          aria-current={locale === currentLocale ? 'true' : undefined}
          onClick={(e) => onClick(e, locale)}
        >
          {labels[locale]}
        </a>
      ))}
    </div>
  );
}
