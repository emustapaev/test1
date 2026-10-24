import { notFound } from 'next/navigation';

// Неизвестные пути внутри /{locale}/ рендерят локализованный [locale]/not-found.tsx (статус 404).
export default function CatchAll() {
  notFound();
}
