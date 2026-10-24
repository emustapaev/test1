import { notFound } from 'next/navigation';

// Прямой заход на /{locale}/404/ — обычный 404 через not-found (статус 404).
export default function NotFoundPage() {
  notFound();
}
