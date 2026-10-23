import type { Messages } from '@/i18n/getMessages';
import { BenefitIcon } from './icons';

export function Benefits({ messages }: { messages: Messages }) {
  const { benefits: t } = messages;
  return (
    <section className="alt" id="benefits" aria-labelledby="ben-title">
      <div className="container">
        <div className="section-head">
          <h2 id="ben-title">{t.title}</h2>
          <p>{t.intro}</p>
        </div>
        <ul className="grid">
          {t.items.map((it, i) => (
            <li className="card" key={it.title}>
              <BenefitIcon index={i} />
              <h3>{it.title}</h3>
              <p>{it.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
