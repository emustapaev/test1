import { test, expect } from '@playwright/test';
import ru from '../../apps/web/messages/ru.json';

// Реальные заявки не отправляются: /api/lead всегда перехватывается.
// Тег письма [RU] и «Language: RU» проверяются юнит-тестами API (T11), см. README.

test.describe('форма заявки на /ru/ (сценарий 9)', () => {
  test('пустая отправка показывает русские ошибки', async ({ page }) => {
    let called = false;
    await page.route('**/api/lead', (route) => {
      called = true;
      return route.abort();
    });
    await page.goto('/ru/');
    await page.getByTestId('lead-submit').click();

    const form = page.getByTestId('lead-form');
    await expect(form.getByText(ru.form.errors.required).first()).toBeVisible();
    expect(called).toBe(false);
  });

  test('успешная отправка: locale "ru" в теле и русское сообщение', async ({ page }) => {
    let body: Record<string, unknown> | undefined;
    await page.route('**/api/lead', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.goto('/ru/');
    const form = page.getByTestId('lead-form');
    await form.getByLabel(ru.form.fields.name.label).fill('Тест Тестов');
    await form.getByLabel(ru.form.fields.email.label).fill('test@example.com');
    await form.getByLabel(ru.form.fields.message.label).fill('Автотест: сообщение не уходит в прод.');
    await page.getByTestId('lead-submit').click();

    const success = page.getByTestId('lead-success');
    await expect(success).toBeVisible();
    await expect(success).toContainText(ru.form.success);
    expect(body?.locale).toBe('ru');
  });
});
