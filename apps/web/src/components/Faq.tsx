'use client';

import { useState } from 'react';
import type { Messages } from '@/i18n/getMessages';

export function Faq({ messages }: { messages: Messages }) {
  const { faq: t } = messages;
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="alt" id="faq" aria-labelledby="faq-title">
      <div className="container">
        <div className="section-head">
          <h2 id="faq-title">{t.title}</h2>
        </div>
        <div className="faq">
          {t.items.map((it, i) => {
            const isOpen = open === i;
            return (
              <div className="faq-item" key={it.question} data-open={isOpen}>
                <h3>
                  <button
                    type="button"
                    id={`faq-q-${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    {it.question}
                  </button>
                </h3>
                <div className="answer" id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} hidden={!isOpen}>
                  <p>{it.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
