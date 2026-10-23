import type { ReactNode } from 'react';
import type { Messages } from '@/i18n/getMessages';

export function ContactSection({
  messages,
  leadForm,
}: {
  messages: Messages;
  /** Слот под <LeadForm locale=... /> (T10). */
  leadForm?: ReactNode;
}) {
  const { contact: t } = messages;
  return (
    <section id="contact" aria-labelledby="contact-title">
      <div className="container">
        <div className="contact-layout">
          <div className="section-head">
            <h2 id="contact-title">{t.title}</h2>
            <p>{t.intro}</p>
          </div>
          <div className="form-slot">{leadForm}</div>
        </div>
      </div>
    </section>
  );
}
