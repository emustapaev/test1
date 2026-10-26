# Приёмка v5: чек-лист

Автоматические пункты проверяет `scripts/smoke/post-deploy.sh` (шаг «Post-deploy smoke» в `deploy.yml`):
200 на `/en/` и `/ru/`, 403 на прямой S3 URL, 301 www → apex (при `CUSTOM_DOMAIN_ENABLED=true`),
400 на невалидный POST `/contact`, отказ CORS для чужого origin.

Локальный запуск:

```bash
SITE_URL=https://xxxx.cloudfront.net API_ENDPOINT=https://xxxx.execute-api.eu-west-3.amazonaws.com \
SITE_BUCKET=<bucket> AWS_REGION=eu-west-3 CUSTOM_DOMAIN_ENABLED=false bash scripts/smoke/post-deploy.sh
```

## Ручные пункты

- [ ] Валидная заявка с формы (EN и RU) приходит на gulmira@krunai.uz; From — noreply@krunai.uz.
- [ ] Reply-To равен email посетителя.
- [ ] В письме: имя, email, сообщение, язык (EN/RU), время в UTC.
- [ ] CR/LF в имени/email отклоняются (400 `invalid_format`), письмо не уходит.
- [ ] Honeypot (`website` непустое): ответ 200, письма нет, в CloudWatch Logs есть `honeypot_triggered` без PII.
- [ ] Превышение лимита → 429, фронт показывает локализованное «попробуйте позже».
- [ ] Alarm на ошибки Lambda переходит в ALARM при искусственной ошибке (стенд) и шлёт уведомление в SNS `alerts`.
- [ ] После включения домена: `curl -I https://www.krunai.uz/foo?x=1` → 301 на `https://krunai.uz/foo?x=1`.
