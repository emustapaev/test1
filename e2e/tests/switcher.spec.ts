import { test, expect } from '@playwright/test';
import ru from '../../apps/web/messages/ru.json';

test('5: переключатель на /en/#faq → /ru/#faq, cookie lang=ru, затем / → /ru/', async ({ page, context, request, baseURL }) => {
  await page.goto('/en/#faq');
  await page.getByRole('group', { name: ru.switcher.label }).or(page.locator('.lang')).first()
    .getByRole('link', { name: ru.switcher.ru, exact: true }).click();

  await expect(page).toHaveURL(/\/ru\/#faq$/);
  const cookies = await context.cookies(baseURL);
  expect(cookies.find((c) => c.name === 'lang')?.value).toBe('ru');

  // «Повторное открытие»: / с этой cookie ведёт на /ru/ (даже при Accept-Language: en).
  const res = await request.get('/', {
    maxRedirects: 0,
    headers: { Cookie: 'lang=ru', 'Accept-Language': 'en-US' },
  });
  expect(res.status()).toBe(302);
  expect(new URL(res.headers()['location'], res.url()).pathname).toBe('/ru/');
});
