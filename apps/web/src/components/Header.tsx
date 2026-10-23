import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/config';
import type { Messages } from '@/i18n/getMessages';

const links = [
  ['how-it-works', 'howItWorks'],
  ['benefits', 'benefits'],
  ['examples', 'examples'],
  ['faq', 'faq'],
  ['contact', 'contact'],
] as const;

export function Header({
  locale,
  messages,
  languageSwitcher,
}: {
  locale: Locale;
  messages: Messages;
  /** Слот под <LanguageSwitcher /> (T8). */
  languageSwitcher?: ReactNode;
}) {
  const { header, nav } = messages;
  return (
    <header className="site-header" data-locale={locale}>
      <div className="container bar">
        <a className="logo" href="#hero" aria-label="KRunAI">
          KRun<span>AI</span>
        </a>
        <input className="menu-toggle" type="checkbox" id="menu-toggle" aria-label={header.menu} />
        <label className="burger" htmlFor="menu-toggle" aria-hidden="true">
          <i />
          <span>{header.menu}</span>
        </label>
        <div className="lang-slot">{languageSwitcher}</div>
        <nav className="site-nav" aria-label={header.mainNav}>
          <ul>
            {links.map(([id, key]) => (
              <li key={id}>
                <a href={`#${id}`}>{nav[key]}</a>
              </li>
            ))}
            <li className="mobile-only">
              <a href="#contact">{header.cta}</a>
            </li>
          </ul>
        </nav>
        <a className="btn btn-primary header-cta" href="#contact">
          {header.cta}
        </a>
      </div>
    </header>
  );
}
