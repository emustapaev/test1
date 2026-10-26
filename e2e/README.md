# E2E (Playwright)

Тесты идут против **статического экспорта** `apps/web/out`, который раздаёт `scripts/static-server.mjs`
(поднимается автоматически через `webServer` в `playwright.config.ts`, порт `E2E_PORT`, по умолчанию 4173).
Продакшен не затрагивается. Только chromium.

## Запуск одной командой

```bash
npm ci
NEXT_PUBLIC_LEAD_API_URL=http://localhost:4010/contact npm run build -w apps/web
(cd e2e && npx playwright install chromium)
npx playwright test -c e2e
```

`NEXT_PUBLIC_LEAD_API_URL` нужен при сборке: адрес `http://localhost:4010/contact` перехватывается `page.route`,
реальный API не вызывается.

## Lighthouse

```bash
npx --yes @lhci/cli@0.14.x autorun --config=lighthouserc.json
```

Пороги ≥ 0.9: Performance, Accessibility, SEO для `/en/` и `/ru/`.

## Покрытие

| Файл | Сценарии |
|---|---|
| `lead-form.spec.ts` | EN и RU: пустая отправка, 200 (`lang` в теле), 400 `validation_error` (коды полей → локализованные тексты), 400 `bad_request`, 429, 500, honeypot `website`, лимит 5000 символов |
| `locale-redirect.spec.ts` | `/en/`, `/ru/` → 200 и `<html lang>`, 404 для неизвестного пути |
| `switcher.spec.ts` | переключатель EN→RU с сохранением `#faq`, cookie `lang=ru` |
| `seo.spec.ts` | hreflang, canonical, `sitemap.xml` |
| `layout.spec.ts` | отсутствие переполнения/обрезки на 320/768/1440 px |

Редирект `/` по локали — CloudFront Function, в e2e не проверяется (покрыт node-тестами T4).
Тексты ошибок берутся из `apps/web/messages/{en,ru}.json`.
