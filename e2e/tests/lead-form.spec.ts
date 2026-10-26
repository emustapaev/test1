import { test, expect, type Page, type Route } from '@playwright/test';
import en from '../../apps/web/messages/en.json';
import ru from '../../apps/web/messages/ru.json';

// Реальные заявки не отправляются: POST /contact (NEXT_PUBLIC_LEAD_API_URL=http://localhost:4010/contact)
// всегда перехватывается через page.route.
const CONTACT = '**/contact';
const dicts = { en, ru } as const;

type Body = Record<string, unknown>;

async function mock(page: Page, handler: (route: Route, body: Body) => Promise<void> | void) {
  const calls: Body[] = [];
  await page.route(CONTACT, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as Body;
    calls.push(body);
    await handler(route, body);
  });
  return calls;
}

const json = (route: Route, status: number, data: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

async function fillForm(page: Page, locale: 'en' | 'ru', message = 'Автотест: сообщение не уходит в прод.') {
  const t = dicts[locale].form;
  const form = page.getByTestId('lead-form');
  await form.getByLabel(t.fields.name.label).fill('Test User');
  await form.getByLabel(t.fields.email.label).fill('test@example.com');
  await form.getByLabel(t.fields.message.label).fill(message);
  return form;
}

for (const locale of ['en', 'ru'] as const) {
  const t = dicts[locale].form;

  test.describe(`форма заявки /${locale}/`, () => {
    test('пустая отправка: локализованные ошибки, запрос не уходит', async ({ page }) => {
      const calls = await mock(page, (route) => json(route, 200, { ok: true }));
      await page.goto(`/${locale}/`);
      await page.getByTestId('lead-submit').click();
      const form = page.getByTestId('lead-form');
      await expect(form.getByText(t.errors.required)).toHaveCount(3);
      expect(calls).toHaveLength(0);
    });

    test('200: успех, в теле lang, honeypot пустой', async ({ page }) => {
      const calls = await mock(page, (route) => json(route, 200, { ok: true }));
      await page.goto(`/${locale}/`);
      await fillForm(page, locale);
      await page.getByTestId('lead-submit').click();

      const success = page.getByTestId('lead-success');
      await expect(success).toBeVisible();
      await expect(success).toContainText(t.success);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ name: 'Test User', email: 'test@example.com', lang: locale, website: '' });
      expect(calls[0]).not.toHaveProperty('locale');
    });

    test('400 validation_error: коды полей → локализованные тексты', async ({ page }) => {
      await mock(page, (route) =>
        json(route, 400, {
          error: 'validation_error',
          fields: { name: 'required', email: 'invalid_format', message: 'too_long' },
        }),
      );
      await page.goto(`/${locale}/`);
      const form = await fillForm(page, locale);
      await page.getByTestId('lead-submit').click();

      await expect(form.locator('#lead-name-err')).toHaveText(t.errors.required);
      await expect(form.locator('#lead-email-err')).toHaveText(t.errors.invalid_format);
      await expect(form.locator('#lead-message-err')).toHaveText(t.errors.too_long);
      await expect(page.getByTestId('lead-success')).toHaveCount(0);
    });

    test('400 validation_error: invalid_value отображается локализованно', async ({ page }) => {
      await mock(page, (route) => json(route, 400, { error: 'validation_error', fields: { message: 'invalid_value' } }));
      await page.goto(`/${locale}/`);
      const form = await fillForm(page, locale);
      await page.getByTestId('lead-submit').click();
      await expect(form.locator('#lead-message-err')).toHaveText(t.errors.invalid_value);
    });

    test('400 bad_request: общая ошибка', async ({ page }) => {
      await mock(page, (route) => json(route, 400, { error: 'bad_request' }));
      await page.goto(`/${locale}/`);
      await fillForm(page, locale);
      await page.getByTestId('lead-submit').click();
      const err = page.getByTestId('lead-error');
      await expect(err).toContainText(t.errorTitle);
      await expect(err).toContainText(t.errors.generic);
    });

    test('429: сообщение о лимите запросов (тело не читается)', async ({ page }) => {
      await mock(page, (route) => route.fulfill({ status: 429, contentType: 'text/plain', body: 'Too Many Requests' }));
      await page.goto(`/${locale}/`);
      await fillForm(page, locale);
      await page.getByTestId('lead-submit').click();
      const err = page.getByTestId('lead-error');
      await expect(err).toContainText(t.errors.rate_limited);
      await expect(page.getByTestId('lead-submit')).toHaveText(t.retry);
    });

    test('500: общая ошибка, введённый текст сохраняется', async ({ page }) => {
      await mock(page, (route) => json(route, 500, { error: 'internal_error' }));
      await page.goto(`/${locale}/`);
      const form = await fillForm(page, locale, 'Сохранить этот текст');
      await page.getByTestId('lead-submit').click();
      await expect(page.getByTestId('lead-error')).toContainText(t.errors.generic);
      await expect(form.getByLabel(t.fields.message.label)).toHaveValue('Сохранить этот текст');
    });

    test('honeypot: поле скрыто от пользователя, заполненное значение уходит в API', async ({ page }) => {
      const calls = await mock(page, (route) => json(route, 200, { ok: true }));
      await page.goto(`/${locale}/`);
      const hp = page.locator('input[name="website"]');
      // Поле вынесено за экран (.hp), скрыто от AT и исключено из tab-порядка.
      await expect(page.locator('.hp')).toHaveAttribute('aria-hidden', 'true');
      await expect(hp).toHaveAttribute('tabindex', '-1');
      const box = await hp.boundingBox();
      expect(box === null || box.x + box.width < 0).toBe(true);
      await fillForm(page, locale);
      await hp.evaluate((el: HTMLInputElement) => {
        el.value = 'http://spam.example';
      });
      await page.getByTestId('lead-submit').click();
      // Сервер отвечает 200 и молча отбрасывает заявку; клиент показывает успех.
      await expect(page.getByTestId('lead-success')).toBeVisible();
      expect(calls[0]?.website).toBe('http://spam.example');
    });

    test('лимит сообщения: 5000 проходит, 5001 блокируется на клиенте', async ({ page }) => {
      const calls = await mock(page, (route) => json(route, 200, { ok: true }));
      await page.goto(`/${locale}/`);
      const form = await fillForm(page, locale, 'a'.repeat(5001));
      await page.getByTestId('lead-submit').click();
      await expect(form.locator('#lead-message-err')).toHaveText(t.errors.too_long);
      expect(calls).toHaveLength(0);

      await form.getByLabel(t.fields.message.label).fill('a'.repeat(5000));
      await page.getByTestId('lead-submit').click();
      await expect(page.getByTestId('lead-success')).toBeVisible();
      expect(calls).toHaveLength(1);
      expect((calls[0].message as string).length).toBe(5000);
    });
  });
}
