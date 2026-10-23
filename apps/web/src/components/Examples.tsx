import type { Messages } from '@/i18n/getMessages';
import { ExampleIcon } from './icons';

export function Examples({ messages }: { messages: Messages }) {
  const { examples: t } = messages;
  return (
    <section id="examples" aria-labelledby="ex-title">
      <div className="container">
        <div className="section-head">
          <h2 id="ex-title">{t.title}</h2>
          <p>{t.intro}</p>
        </div>
        <ul className="grid examples-grid">
          {t.items.map((it, i) => (
            <li className="card" key={it.title}>
              <ExampleIcon index={i} />
              <h3>{it.title}</h3>
              <p>{it.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
