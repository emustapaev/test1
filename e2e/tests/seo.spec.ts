import { test, expect } from '@playwright/test';

const origin = (baseURL?: string) => new URL(baseURL!).origin;

for (const lang of ['en', 'ru']) {
  test(`8: /${lang}/ — hreflang и canonical`, async ({ page, baseURL }) => {
    await page.goto(`/${lang}/`);
    const href = (sel: string) => page.locator(sel).first().getAttribute('href');
    const en = await href('link[rel="alternate"][hreflang="en"]');
    const ru = await href('link[rel="alternate"][hreflang="ru"]');
    const def = await href('link[rel="alternate"][hreflang="x-default"]');
    const canonical = await href('link[rel="canonical"]');
    expect(en).toMatch(/\/en\/$/);
    expect(ru).toMatch(/\/ru\/$/);
    expect(def).toMatch(/\/en\/$/);
    expect(canonical).toMatch(new RegExp(`/${lang}/$`));
    // canonical указывает на собственный URL страницы (по домену из SITE_URL)
    expect(new URL(canonical!, origin(baseURL)).pathname).toBe(`/${lang}/`);
  });
}

test('8: sitemap.xml содержит оба URL', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect(xml).toMatch(/<loc>[^<]*\/en\/<\/loc>/);
  expect(xml).toMatch(/<loc>[^<]*\/ru\/<\/loc>/);
});
