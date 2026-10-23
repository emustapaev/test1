import type { Messages } from '@/i18n/getMessages';

export function Hero({ messages }: { messages: Messages }) {
  const { hero } = messages;
  return (
    <section className="hero" id="hero" aria-labelledby="hero-title">
      <div className="container">
        <p className="eyebrow">{hero.eyebrow}</p>
        <h1 id="hero-title">{hero.title}</h1>
        <p className="lead">{hero.subtitle}</p>
        <div className="actions">
          <a className="btn btn-primary" href="#contact">
            {hero.cta}
          </a>
          <a className="btn btn-secondary" href="#how-it-works">
            {hero.secondaryCta}
          </a>
        </div>
      </div>
    </section>
  );
}
