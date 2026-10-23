import { test, expect } from '@playwright/test';

const locales = ['en', 'ru'] as const;
const viewports = [
  { width: 320, height: 640 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

// Элементы, текст которых не должен обрезаться
const CLIPPABLE = 'button, nav a, [data-testid=lead-submit]';

for (const locale of locales) {
  for (const viewport of viewports) {
    test(`layout /${locale}/ @ ${viewport.width}px: без переполнения и обрезки`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(`/${locale}/`);
      await page.waitForLoadState('networkidle');

      const doc = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        doc.scrollWidth,
        `горизонтальный скролл: scrollWidth=${doc.scrollWidth}, clientWidth=${doc.clientWidth}`,
      ).toBeLessThanOrEqual(doc.clientWidth);

      const clipped = await page.evaluate((selector) => {
        return Array.from(document.querySelectorAll<HTMLElement>(selector))
          .filter((el) => el.getClientRects().length > 0)
          .filter((el) => el.scrollWidth > el.clientWidth)
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 60),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          }));
      }, CLIPPABLE);
      expect(clipped, `обрезанные элементы: ${JSON.stringify(clipped)}`).toEqual([]);

      await page.screenshot({
        path: testInfo.outputPath(`${locale}-${viewport.width}.png`),
        fullPage: true,
      });
      await testInfo.attach(`${locale}-${viewport.width}`, {
        path: testInfo.outputPath(`${locale}-${viewport.width}.png`),
        contentType: 'image/png',
      });
    });
  }
}
