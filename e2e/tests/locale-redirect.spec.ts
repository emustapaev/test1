import { test, expect } from '@playwright/test';

// Редирект «/» по локали — CloudFront Function; в e2e против статики не проверяется
// (покрыт node-тестами функции, тикет T4).

test.describe('страницы локалей', () => {
  for (const lang of ['en', 'ru']) {
    test(`/${lang}/ → 200, <html lang="${lang}">`, async ({ request }) => {
      const res = await request.get(`/${lang}/`, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      expect(await res.text()).toMatch(new RegExp(`<html[^>]*\\blang="${lang}"`));
    });
  }

  test('неизвестный путь → 404.html', async ({ request }) => {
    const res = await request.get('/no-such-page/', { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });
});
