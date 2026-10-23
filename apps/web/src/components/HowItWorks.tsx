import type { Messages } from '@/i18n/getMessages';
import { HowItWorksIcon } from './icons';

export function HowItWorks({ messages }: { messages: Messages }) {
  const { howItWorks: t } = messages;
  return (
    <section id="how-it-works" aria-labelledby="how-title">
      <div className="container">
        <div className="section-head">
          <h2 id="how-title">{t.title}</h2>
          <p>{t.intro}</p>
        </div>
        <ol className="grid">
          {t.steps.map((s, i) => (
            <li className="card" key={s.title}>
              <HowItWorksIcon index={i} />
              <span className="step-no">{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="process">
          <h3>{t.process.title}</h3>
          <ol>
            {t.process.steps.map((s) => (
              <li key={s}>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
