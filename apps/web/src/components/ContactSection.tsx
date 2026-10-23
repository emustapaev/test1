import type { Messages } from '@/i18n/getMessages';
import type { Locale } from '@/i18n/config';
import { LeadForm } from './LeadForm';

export function ContactSection({ locale, messages }: { locale: Locale; messages: Messages }) {
  const { contact: t } = messages;
  return (
    <section id="contact" aria-labelledby="contact-title">
      <div className="container">
        <div className="contact-layout">
          <div className="section-head">
            <h2 id="contact-title">{t.title}</h2>
            <p>{t.intro}</p>
          </div>
          <div className="form-slot"><LeadForm locale={locale} messages={messages} /></div>
        </div>
      </div>
    </section>
  );
}
