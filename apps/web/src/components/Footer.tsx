import type { Messages } from '@/i18n/getMessages';

export function Footer({ messages }: { messages: Messages }) {
  const { footer } = messages;
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <a className="logo" href="#hero" aria-label="KRunAI">
          KRun<span>AI</span>
        </a>
        <small>{footer.rights}</small>
        <a href="#contact">{footer.cta}</a>
      </div>
    </footer>
  );
}
