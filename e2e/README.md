# E2E (Playwright)

Тесты идут по задеплоенному сайту: `BASE_URL` (по умолчанию `https://krunai.uz`). Только chromium.

## Запуск одной командой

```bash
npm ci
cd e2e && npx playwright install chromium && BASE_URL=https://krunai.uz npx playwright test
```

Либо из корня: `npm run test -w e2e` (браузер один раз: `npm run install:browsers -w e2e`).

## Покрытие (ТЗ v3 §6)

| Файл | Сценарии |
|---|---|
| `locale-redirect.spec.ts` | 1, 2 (en-US, uz-UZ, без заголовка), 3, 4 (200 и `<html lang>`), 6 |
| `switcher.spec.ts` | 5 |
| `lead-form.spec.ts` | 9 (RU-ошибки, успех с `locale: "ru"`) |
| `seo.spec.ts` | 8 (hreflang, canonical, sitemap) |

Редиректы проверяются через `request` с `maxRedirects: 0`. Сценарий 7 — `check:i18n` в CI; сценарий 10 — T19.

## Заявки

Тесты **не отправляют реальные заявки**: `**/api/lead` перехватывается через `page.route`.
Тема письма `[RU]` и строка `Language: RU` проверяются юнит-тестами API (T11), не здесь.
Тексты берутся из `apps/web/messages/ru.json`.
