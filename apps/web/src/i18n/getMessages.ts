import type { Locale } from './config';
import type en from '../../messages/en.json';

export type Messages = typeof en;

// Шаблонный импорт: бандлер подхватывает все messages/*.json при сборке,
// поэтому новая локаль требует только файла сообщений и записи в `locales`.
export async function getMessages(locale: Locale): Promise<Messages> {
  return (await import(`../../messages/${locale}.json`)).default as Messages;
}
