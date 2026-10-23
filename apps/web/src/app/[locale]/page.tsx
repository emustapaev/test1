import { isLocale } from '@/i18n/config';
import { getMessages } from '@/i18n/getMessages';
import { notFound } from 'next/navigation';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { HowItWorks } from '@/components/HowItWorks';
import { Benefits } from '@/components/Benefits';
import { Examples } from '@/components/Examples';
import { Faq } from '@/components/Faq';
import { ContactSection } from '@/components/ContactSection';
import { Footer } from '@/components/Footer';

export default async function HomePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const { locale } = params;
  const messages = await getMessages(locale);
  return (
    <>
      <a className="skip" href="#main">
        {messages.header.skip}
      </a>
      <Header locale={locale} messages={messages} />
      <main id="main">
        <Hero messages={messages} />
        <HowItWorks messages={messages} />
        <Benefits messages={messages} />
        <Examples messages={messages} />
        <Faq messages={messages} />
        <ContactSection locale={locale} messages={messages} />
      </main>
      <Footer messages={messages} />
    </>
  );
}
