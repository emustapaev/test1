import { test, expect } from '@playwright/test';
import ru from '../../apps/web/messages/ru.json';

test('переключатель на /en/#faq → /ru/#faq, cookie lang=ru', async ({ page, context, baseURL }) => {
  await page.goto('/en/#faq');
  await page
    .getByRole('group', { name: ru.switcher.label })
    .or(page.locator('.lang'))
    .first()
    .getByRole('link', { name: ru.switcher.ru, exact: true })
    .click();

  await expect(page).toHaveURL(/\/ru\/#faq$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  const cookies = await context.cookies(baseURL);
  expect(cookies.find((c) => c.name === 'lang')?.value).toBe('ru');
});
