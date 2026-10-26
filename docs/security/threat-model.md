# Модель угроз (STRIDE) v5: статический сайт + форма на serverless

Область: `infra/terraform/*.tf`, `apps/api/lead/*.py`, `infra/functions/locale-router.js`, `.github/workflows/*.yml`.
Источник правды: `docs/spec/v5-technical.md`, `docs/platform-contract.md`. Вне рамок: пентест продакшена и AWS в целом.
Дата ревью: 2026-10-26. Подробные находки и план исправлений — в `docs/security/v5-review.md`.

Предыдущая версия модели описывала вариант с DynamoDB, TypeScript-Lambda, `/api/*` на CloudFront и rate limit по IP. В v5 этого нет (хранилища заявок нет, API Gateway вызывается напрямую из браузера), поэтому модель переписана.

## Архитектура и границы доверия

```
Браузер ──HTTPS──> CloudFront ──OAC──> S3 (private, статика)
   │                  └─ Function viewer-request (www→apex, locale, index.html)
   └─HTTPS, CORS──> API Gateway HTTP API (POST /contact, throttling)
                        └─> Lambda python3.12 ──> SES v2 (eu-west-3) ──> gulmira@krunai.uz (Zoho)
Платформа ──тег release-*──> GitHub Actions ──OIDC──> роль ai-team-deploy ──> Terraform / s3 sync
```

Границы доверия:
1. Интернет → CloudFront и интернет → API Gateway (API не за CloudFront; `execute-api` доступен всем).
2. API Gateway → Lambda (AWS_PROXY, `lambda:InvokeFunction` только для этого API).
3. Lambda → SES (роль с boundary, `ses:SendEmail` на identity `krunai.uz`).
4. GitHub Actions → AWS (OIDC, доверие только тегам `release-*`).

Недоверенный ввод: URI, query string, cookie `lang`, `Accept-Language`, `Host` (в Function); JSON-тело формы (в Lambda).
Данные: ПДн посетителя (имя, email, текст) только транзитом в письме; нигде не хранятся и не логируются.

## Активы
- Репутация SES-домена `krunai.uz` и доставляемость почты (общая с Zoho-доменом).
- Почтовый ящик gulmira@krunai.uz (спам/фишинг через форму).
- ПДн посетителей в транзите и в ящике Zoho.
- Целостность сайта (S3) и права деплой-роли AWS.

## STRIDE по компонентам

| Компонент | Угроза | Мера в v5 | Остаточный риск (ссылка на находку) |
|---|---|---|---|
| S3 + CloudFront | Information disclosure: прямой доступ к бакету | Block Public Access ×4, `BucketOwnerEnforced`, доступ только `cloudfront.amazonaws.com` с `AWS:SourceArn` = distribution (OAC), deny без TLS, SSE-S3. Прямой URL бакета → 403 | F-12 (нет versioning/логов) |
| S3 + CloudFront | Information disclosure: перечисление ключей | OAC без `s3:ListBucket`; отсутствующий ключ → 403 от S3, CloudFront отдаёт единую 404 | — |
| CloudFront | Tampering: заголовки/CSP | HSTS 2 года, nosniff, X-Frame-Options DENY, Referrer-Policy, CSP | **F-01**: `connect-src 'self'` блокирует отправку формы на API Gateway |
| CF Function | Tampering: open redirect, header injection | Редирект только на константы (`CANONICAL_HOST`, `'/'+lang+'/'`), `lang` из allow-list; CR/LF в URI/query CloudFront не пропускает, в Location они остаются процентно-кодированными | F-10 (query не перекодируется — принято) |
| API Gateway | Spoofing/Abuse: заявки напрямую в обход сайта | CORS — только для браузеров, не защита; stage-throttling 5 rps / burst 10, honeypot | **F-03**: лимит общий, не по клиенту; один клиент исчерпывает лимит или заваливает ящик |
| API Gateway | CORS | `allow_origins`: `https://krunai.uz`, `*.cloudfront.net` дистрибуции, `http://localhost:3000`; методы POST/OPTIONS; заголовок `content-type` | F-04 (localhost в prod, cloudfront-домен) |
| Lambda | Tampering: header injection в письме | Subject — константа от `lang` (allow-list); имя/email отклоняются при CR/LF; `Reply-To` передаётся структурным полем SES; адреса From/To — из env | F-06 (NUL/Unicode в email → 500 вместо 400) |
| Lambda | Information disclosure: PII в логах | Логируются `event`, `request_id`, `status`, `lang`, `honeypot`, `error_type`; текст исключения не логируется; access-лог API без IP и тела | F-09 (LOG_LEVEL/платформенные логи — проверка при изменениях) |
| Lambda | DoS / cost | timeout 10 с, 128 МБ, throttling API | F-03 (нет reserved concurrency) |
| IAM | Elevation of privilege | Роль Lambda: `ses:SendEmail` на ARN identity + `logs:CreateLogStream/PutLogEvents` на свою группу; `permissions_boundary`; имя без `ai-team-` | F-07 (resource-level проверка SES для получателя в sandbox — подтвердить на стенде) |
| SES | Репутация/abuse | DKIM 2048, custom MAIL FROM, алармы bounce/complaint → SNS | F-03 |
| GitHub Actions | Elevation через supply chain | Deploy только по тегу `release-*`, OIDC, без ключей, concurrency | **F-02**: сторонний код (npm/pip/npx) исполняется в job с `id-token: write`; actions по тегам, а не по SHA (F-08) |
| GitHub Actions | e2e.yml | Только `contents: read`, без AWS | F-05 (`workflow_run` с фильтром `main` не срабатывает после тегового деплоя; `workflow_dispatch`) |
| Правовое | Локализация ПДн (Узбекистан) | Хранилища нет, данные транзитом через eu-west-3 и в Zoho | **F-11**: юридический риск, нужна консультация |

## Допущения
- WAF не используется по согласованному ТЗ (бюджет ≈ $0); компенсируется throttling и honeypot.
- Rate limit по IP и хранилище состояния отсутствуют по ТЗ (никаких DynamoDB/S3 для payload).
- SES в sandbox: письма уходят только на верифицированные адреса; выход из sandbox повышает значимость F-03.

## Проверки
`terraform validate` и `terraform fmt -check` (CI); `pytest` в `apps/api`; `node --test infra/functions/*.test.mjs`. Terraform и AWS в окружении ревью недоступны: выводы по IaC получены чтением кода, а не `plan`.
