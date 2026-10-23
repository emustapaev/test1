import { isLocale } from '@/i18n/config';
import { getMessages } from '@/i18n/getMessages';
import { notFound } from 'next/navigation';

export default async function HomePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const messages = await getMessages(params.locale);
  return (
    <main>
      <h1>{messages.meta.title}</h1>
    </main>
  );
}
