import { test, expect } from '@playwright/test';

const get = (request: import('@playwright/test').APIRequestContext, url: string, headers: Record<string, string> = {}) =>
  request.get(url, { maxRedirects: 0, headers });

test.describe('редирект с / (сценарии 1–3, 6)', () => {
  test('1: Accept-Language ru-RU без cookie → /ru/', async ({ request }) => {
    const res = await get(request, '/', { 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8' });
    expect(res.status()).toBe(302);
    expect(new URL(res.headers()['location'], res.url()).pathname).toBe('/ru/');
  });

  for (const al of ['en-US', 'uz-UZ', undefined]) {
    test(`2: Accept-Language ${al ?? '(нет)'} → /en/`, async ({ request }) => {
      const res = await get(request, '/', al ? { 'Accept-Language': al } : {});
      expect(res.status()).toBe(302);
      expect(new URL(res.headers()['location'], res.url()).pathname).toBe('/en/');
    });
  }

  test('3: cookie lang=en побеждает Accept-Language: ru', async ({ request }) => {
    const res = await get(request, '/', { Cookie: 'lang=en', 'Accept-Language': 'ru' });
    expect(res.status()).toBe(302);
    expect(new URL(res.headers()['location'], res.url()).pathname).toBe('/en/');
  });

  test('6: query string сохраняется', async ({ request }) => {
    const res = await get(request, '/?utm_source=x', { 'Accept-Language': 'ru' });
    expect(res.status()).toBe(302);
    const loc = new URL(res.headers()['location'], res.url());
    expect(loc.pathname).toBe('/ru/');
    expect(loc.search).toBe('?utm_source=x');
  });
});

test.describe('страницы локалей (сценарий 4)', () => {
  for (const lang of ['en', 'ru']) {
    test(`4: /${lang}/ → 200, <html lang="${lang}">`, async ({ request }) => {
      const res = await get(request, `/${lang}/`);
      expect(res.status()).toBe(200);
      expect(await res.text()).toMatch(new RegExp(`<html[^>]*\\blang="${lang}"`));
    });
  }
});
