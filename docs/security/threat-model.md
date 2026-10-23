# Модель угроз (STRIDE): locale-router, cookie `lang`, форма заявок, заголовки

Область: `infra/functions/locale-router.js`, `apps/api/src/*`, `infra/terraform/{cloudfront,api,ses,dynamodb}.tf`.
Вне рамок: пентест AWS в целом. Дата ревью: 2026-10-23.

## Активы и границы доверия
- Браузер (недоверенный) → CloudFront (edge-функция, response headers policy) → S3 (статика) / HTTP API → Lambda → SES, DynamoDB.
- Недоверенный ввод: URI, query string, cookie `lang`, `Accept-Language`, JSON-тело заявки, `X-Forwarded-For`.

## Находки

| # | STRIDE | Угроза | Severity | Статус |
|---|--------|--------|----------|--------|
| 1 | Tampering | Open redirect через `/`: location строится из ввода | Low | Закрыто: путь = `'/' + lang + '/'`, `lang` — только элемент `SUPPORTED` (`en`,`ru`) или `DEFAULT`; хост/схема не участвуют. Cookie и Accept-Language сравниваются с allow-list, произвольные значения отбрасываются. Query добавляется только после `?`, на хост не влияет |
| 2 | Tampering | Инъекция через cookie `lang` / `Accept-Language` | Low | Закрыто: значение не отражается, а только сравнивается с allow-list (`indexOf`); парсинг q устойчив к мусору (NaN → 0) |
| 3 | Tampering | Отравление кэша редиректа | Low | Закрыто: ответ 302 формирует функция на viewer-request, `cache-control: no-store`; редирект зависит от cookie/заголовка, но не кэшируется. HTML-политика кэша не включает cookie/заголовки в ключ, а `/` до кэша не доходит |
| 4 | Tampering | Query string в `Location` передаётся без перекодирования | Low | Принято: значения остаются как отдал CloudFront, путь фиксирован, CR/LF в заголовок CloudFront не пропускает. Хост подменить нельзя |
| 5 | Tampering | Header injection в письме (имя в теме) | Medium | Исправлено: `buildSubject` заменяет все управляющие символы (`\p{Cc}`, включая CR/LF, NUL, NEL) и U+2028/2029 на пробел; тест в `apps/api/test/email.test.ts`. `Reply-To` передаётся структурным полем SESv2 и дополнительно проверяется regex без пробельных символов. `locale` — только allow-list, `FromEmailAddress`/`To` — из env |
| 6 | DoS / Abuse | Спам формы | Medium | Смягчено: honeypot `website`, лимиты длины полей, rate limit по IP в DynamoDB (5 за 10 мин), throttling API 5 rps/burst 10, reserved concurrency Lambda 5, SES sandbox |
| 7 | Spoofing / DoS | Rate limit обходится подменой `X-Forwarded-For`: `clientIp` берёт **первый** элемент заголовка, который контролирует клиент | Medium | Открыто: нужно брать адрес, добавленный доверенным прокси (CloudFront), с учётом числа хопов, и проверить на реальном стенде; изменение не сделано, чтобы не сломать лимит без проверки. Остаточный риск ограничен throttling API и concurrency |
| 8 | Spoofing | Прямое обращение к `execute-api` в обход CloudFront | Low | Открыто: ограничено throttling и CORS; опционально — секретный заголовок от CloudFront (origin custom header) |
| 9 | Info disclosure | PII в логах | — | Закрыто: Lambda логирует только `requestId`, `result`, `locale`, имена полей с ошибкой, `errorName`; IP хранится в DynamoDB только как SHA-256 с TTL. Access-лог API: requestId, route, status, latency. CloudFront Function не содержит `console.*` (проверено тестом) |
| 10 | Info disclosure | Хэш IP без соли подбираем по пространству IPv4 | Low | Принято: хранится ≤10 минут (TTL), доступ только у роли Lambda |
| 11 | Elevation | IAM Lambda | Low | Исправлено: убран неиспользуемый `dynamodb:GetItem` (код делает только `UpdateItem`). Остальное минимально: `ses:SendEmail` на две identity, `UpdateItem` на одну таблицу, логи в свою группу |
| 12 | Elevation | OIDC trust для деплоя | — | Не применимо в данной ветке: в репозитории нет IAM-роли/OIDC-провайдера; `ci.yml` не получает AWS-доступ. При добавлении деплоя: trust только на `repo:emustapaev/test1:ref:refs/heads/main` (или environment), `aud=sts.amazonaws.com`, без wildcard по `sub` |
| 13 | Tampering | `/api/*` разрешает все HTTP-методы | Low | Принято: CloudFront требует полный набор методов для POST; API определяет только маршруты `POST`/`OPTIONS /api/lead`, остальное — 404 от API Gateway |
| 14 | Spoofing | Cookie `lang` без HttpOnly | Info | Принято по ТЗ: ставится JS-ом, не секрет, значение валидируется на edge |

## Response headers policy (`aws_cloudfront_response_headers_policy.security`)
- HSTS: max-age 2 года, includeSubDomains, preload — ок.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` — ок.
- CSP: `script-src 'self' 'unsafe-inline'` и `style-src 'unsafe-inline'` необходимы статическому Next.js (inline-скрипты гидратации); nonce на статике невозможен. Принятый остаточный риск (Low). Добавлен `object-src 'none'`. `connect-src 'self'` корректен, так как `/api/*` на том же домене.
- Политика не привязана к `/api/*`: ответы JSON, браузером как документ не рендерятся (Low, принято).

## Проверки
`cd apps/api && npm test`; `node --test infra/functions/locale-router.test.mjs`; `terraform validate` (terraform в окружении агента недоступен — не запускался).
