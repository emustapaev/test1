# Архитектура krunai.uz

Источники: `docs/spec/v1-technical.md` (базовое ТЗ), `docs/spec/v2-technical.md` (ТЗ v3, RU-локализация). Решения зафиксированы в ADR: [0001](adr/0001-stack-and-repo-layout.md), [0002](adr/0002-i18n-static-locales.md), [0003](adr/0003-edge-locale-detection.md).

## 1. Обзор

Статический двуязычный (EN/RU) одностраничный лендинг платформы KRunAI. Регион AWS — **eu-west-3 (Paris)**, ACM-сертификат для CloudFront — **us-east-1**. Runtime-сервера нет; единственная динамика — CloudFront Function на edge и один serverless-эндпоинт заявок. Lambda@Edge не используется.

```mermaid
flowchart LR
    V[Посетитель] -->|HTTPS| CF[CloudFront<br/>krunai.uz, www.krunai.uz]
    CF -->|viewer-request| FN[CloudFront Function<br/>locale-router]
    CF -->|"/* (OAC)"| S3[(S3 private bucket<br/>eu-west-3)]
    CF -->|"/api/*"| APIGW[API Gateway HTTP API]
    APIGW --> L[Lambda Python 3.12<br/>обработчик заявок]
    L --> SES[Amazon SES<br/>eu-west-3]
    L --> DDB[(DynamoDB<br/>rate limit, TTL)]
    L --> CW[CloudWatch Logs]
    SES --> M[ernazar.mustapaev@gmail.com]
    DNS[ClouDNS] -.CNAME/ALIAS.-> CF
    ACM[ACM us-east-1] -.TLS.-> CF
```

## 2. Компоненты

| Компонент | Назначение |
|---|---|
| `apps/web` | Next.js 14 App Router, TypeScript strict, Tailwind, `output: 'export'`, `trailingSlash: true`. Результат — `out/` с `en/index.html`, `ru/index.html`, `en/404/index.html`, `ru/404/index.html`. |
| S3 (eu-west-3) | Приватный bucket со статикой, доступ только через CloudFront Origin Access Control (OAC). |
| CloudFront | Один distribution: apex + `www` (www → 301 на apex), HTTP → HTTPS, TLS 1.2+, Response Headers Policy (HSTS, CSP, X-Frame-Options и др.), standard logs в S3. Default behavior → S3; `/api/*` → API Gateway. |
| CloudFront Function `locale-router` | `infra/functions/`, runtime `cloudfront-js-2.0`, viewer-request на default behavior. Редирект по локали только для `/`; для прочих путей переписывание `/x/` → `/x/index.html`. См. ADR 0003. |
| API Gateway HTTP API | `POST /api/lead`, CORS только `https://krunai.uz` и `https://www.krunai.uz`, throttling (burst 10, rate 5 rps). Контракт — `contracts/openapi.yaml` (тикет T2). |
| Lambda заявок (`apps/api`) | Node.js 20 (TypeScript, бандл esbuild), reserved concurrency ≤ 5. Серверная валидация, honeypot (при заполнении — 200 без отправки), проверка `locale` по allow-list (`en`|`ru`, по умолчанию `en`), rate limit, отправка письма. Ошибки валидации возвращаются кодами. Логи JSON без полного текста сообщения, email маскируется, retention 30 дней. |
| Amazon SES (eu-west-3) | Отправка с `no-reply@krunai.uz` (DKIM/SPF/DMARC). Письмо на английском, `Reply-To` = email посетителя, в теме тег `[RU]`/`[EN]`, в теле `Language: RU|EN`. |
| DynamoDB | Таблица rate limit (`RATE_LIMIT_TABLE`), счётчики по ключу клиента с TTL. Это serverless-хранилище без постоянных вычислений; заявки в БД не хранятся. Параметры лимита — по `docs/spec/v1-technical.md` (FR-5: throttling и reserved concurrency); пороги по умолчанию: 5 заявок с IP за 600 с (env `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECONDS`); ключ `ip#<sha256(ip)>`, TTL в `expiresAt`. |
| ACM / ClouDNS | Сертификат `krunai.uz` + `www.krunai.uz` в us-east-1 с DNS-валидацией. DNS остаётся в ClouDNS (Route 53 не используется): CNAME валидации и CNAME/ALIAS на CloudFront добавляются вручную по outputs `acm_validation_records` и `dns_records`. Первый apply: `terraform apply -target=aws_acm_certificate.site`, добавить CNAME, затем полный apply. |
| CloudWatch | Логи Lambda и API GW, alarm на ошибки Lambda > 0 за 5 минут (SNS → email клиента). |
| Terraform (`infra/terraform`) | Terraform >= 1.6, AWS provider ~> 5; state в S3 + DynamoDB lock (eu-west-3). Функция locale-router управляется в IaC вместе с distribution. |
| GitHub Actions (`.github/workflows`) | OIDC в AWS без долгоживущих ключей. Pipeline на push в `main`: lint → typecheck → проверка ключей i18n → build → pytest → S3 sync → CloudFront invalidation. |

Сквозное: Node.js 20 LTS, npm workspaces, документация на русском.

## 3. Потоки запросов

### 3.1. `GET /` — редирект по локали

```mermaid
sequenceDiagram
    participant B as Браузер/бот
    participant CF as CloudFront
    participant FN as locale-router
    B->>CF: GET /?utm_source=x
    CF->>FN: viewer-request
    alt cookie lang = en|ru
        FN-->>B: 302 /{lang}/?utm_source=x, Cache-Control: no-store
    else Accept-Language, максимальный q среди поддерживаемых = ru
        FN-->>B: 302 /ru/?utm_source=x, Cache-Control: no-store
    else иначе
        FN-->>B: 302 /en/?utm_source=x, Cache-Control: no-store
    end
```

Порядок: cookie → `Accept-Language` с учётом q → `en`. Query string сохраняется. Cookie `lang=en|ru; Path=/; Max-Age=31536000; SameSite=Lax; Secure` ставит переключатель языка на клиенте. Функция не логирует персональные данные.

### 3.2. `GET /en/`, `GET /ru/` и прочие пути

Редиректов нет: функция только переписывает URI `/x/` → `/x/index.html` (OAC + S3 не умеют index-документы в подкаталогах). `/en/` → `en/index.html`, `/ru/` → `ru/index.html`, 200 с `<html lang>` нужной локали. Прямые ссылки на локаль никогда не редиректятся. Кэширование — как в v1: HTML `no-cache`, ассеты с хэшем `max-age=31536000, immutable`.

### 3.3. Неизвестный путь → 404

S3 с OAC без `s3:ListBucket` возвращает 403 (иначе 404). Custom error response CloudFront для 403 и 404 отдаёт `/en/404/index.html` со статусом 404. Страница 404 определяет локаль по `location.pathname` (`/ru/...` → RU-текст, иначе EN). Для `/ru/...` без точного совпадения пользователь видит русский текст. Подробности и альтернативы — ADR 0002.

### 3.4. `POST /api/lead`

```mermaid
sequenceDiagram
    participant B as Браузер (/ru/)
    participant CF as CloudFront
    participant G as API Gateway
    participant L as Lambda
    participant D as DynamoDB
    participant S as SES
    B->>CF: POST /api/lead {name,email,message,website,locale}
    CF->>G: behavior /api/*
    G->>L: invoke
    L->>L: валидация, locale allow-list, honeypot
    L->>D: проверка и инкремент rate limit
    L->>S: SendEmail ([RU] ..., Language: RU)
    L-->>B: 200 | 400 коды ошибок | 429 | 500
```

Фронтенд отображает локализованный текст по коду ошибки. Сбой SES → 500 `internal_error` и запись в лог (в ТЗ v1 был 502, контракт T2 использует 500).

### 3.5. Контракт `POST /api/lead`

Источник правды: [`contracts/openapi.yaml`](../contracts/openapi.yaml) (OpenAPI 3.1, линтер: `npx @redocly/cli lint contracts/openapi.yaml`).

Тело запроса (JSON): `name` (1–100, обязательно), `email` (обязательно), `message` (10–2000, обязательно), `locale` (`en`|`ru`, необязательно, по умолчанию `en`), `website` (honeypot, должен быть пустым). Поле `phone` из ориентира тикета не добавлено: его нет в форме v1. Заполненный honeypot → `200 {"ok": true}` без отправки письма.

Сервер не возвращает человекочитаемых текстов, только коды; фронтенд маппит их на локализованные строки.

| HTTP | Тело | Когда |
|------|------|-------|
| 200 | `{"ok": true}` | Успех, в т.ч. сработавший honeypot |
| 400 | `{"error":"validation_error","fields":{"<field>":"<code>"}}` | Ошибка валидации полей (`name`, `email`, `message`, `locale`) |
| 400 | `{"error":"bad_request"}` | Невалидный JSON |
| 429 | `{"error":"rate_limited"}` | Превышен rate limit |
| 500 | `{"error":"internal_error"}` | Внутренний сбой, в т.ч. ошибка SES |

Коды полей (`fields.<field>`):

| Код | Значение |
|-----|----------|
| `required` | Поле отсутствует или пустое |
| `invalid_format` | Неверный формат (например, email) |
| `too_short` | Короче минимума (`message` < 10) |
| `too_long` | Длиннее максимума |
| `invalid_value` | Значение вне допустимого набора (`locale` вне allow-list) |

## 4. Структура репозитория

```
apps/web/              Next.js (статический экспорт), messages/{en,ru}.json
apps/api/              Lambda заявок (Python 3.12) + package.json-обёртка скриптов
infra/functions/       CloudFront Function locale-router
infra/terraform/       Terraform (S3, CloudFront, ACM, API GW, Lambda, SES, DynamoDB, IAM OIDC)
contracts/openapi.yaml OpenAPI контракт POST /api/lead (тикет T2)
design/                бренд-материалы: логотип, палитра, OG-изображение
e2e/                   Playwright E2E по статической сборке
.github/workflows/     CI/CD
docs/                  architecture.md, adr/, spec/
```

Корневой `package.json`: workspaces `["apps/web","apps/api","e2e"]`; скрипты `lint`, `test`, `build` делегируют в workspaces (`--if-present`).

Каталоги `infra/*`, `contracts`, `design`, `.github/workflows` — не npm-пакеты; в каркасе содержат `.gitkeep`, наполняются соответствующими тикетами.

## 5. Переменные окружения

| Переменная | Где | Значение |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | фронт, build-time | `https://krunai.uz` (canonical, hreflang, sitemap, og:url) |
| `NEXT_PUBLIC_LEAD_API_PATH` | фронт, build-time | `/api/lead` |
| `LEAD_TO_EMAIL` | Lambda | `ernazar.mustapaev@gmail.com` |
| `LEAD_FROM_EMAIL` | Lambda | `no-reply@krunai.uz` (SES-верифицированная identity) |
| `RATE_LIMIT_TABLE` | Lambda | имя DynamoDB-таблицы rate limit |
| `ALLOWED_ORIGIN` | Lambda | `https://krunai.uz` (www тоже допустим по v1 FR-5; список уточняется при реализации/T2) |

Секреты в репозитории не хранятся; AWS-доступ в CI — через OIDC.

## 6. i18n и SEO

- Локали: `en` (default/fallback), `ru`. Сообщения: `apps/web/messages/{en,ru}.json`, список локалей — единый модуль `apps/web/src/i18n/config.ts` (ADR 0002).
- CI-проверка: ключи `en` и `ru` совпадают, иначе сборка падает.
- На каждой странице: `<html lang>`, canonical, `hreflang` en/ru/x-default (→ `/en/`), `og:locale` (`en_US`/`ru_RU`) + `og:locale:alternate`; `sitemap.xml` с обеими локалями и alternates.
- Шрифты с кириллицей; вёрстка выдерживает длинные RU-строки при 320 px.

## 7. Как добавить новую локаль

Например, `uz`:

1. Создать `apps/web/messages/uz.json` с тем же набором ключей, что в `en.json`.
2. Добавить `uz` в список локалей `apps/web/src/i18n/config.ts` (и в маппинг `og:locale`, например `uz_UZ`). Страницы `/uz/`, `/uz/404/`, hreflang и sitemap генерируются из этого списка (`generateStaticParams`).
3. Если локаль должна определяться автоматически — добавить её в список поддерживаемых в `infra/functions/locale-router` (ADR 0003) и в allow-list `locale` в `apps/api` и `contracts/openapi.yaml`.
4. Добавить локализованный текст 404 и обновить E2E.
5. Прогнать `npm run lint && npm run build` (проверка ключей) и задеплоить.

Новая инфраструктура не требуется.

## 8. Нефункциональные требования и ограничения

- Только serverless/managed; новой runtime-инфраструктуры сверх CloudFront Function не добавляется.
- Lighthouse (mobile) ≥ 90 по всем категориям в обеих локалях; нет overflow на 320/768/1440 px.
- S3 не публичен; HSTS, CSP, TLS 1.2+.
- Вне рамок: другие локали, CMS для переводов, локализованные письма владельцу, аналитика, БД лидов.

## 9. Terraform: API заявок (T14)

- `infra/terraform/api.tf` — Lambda `handler.handler` (Node 20, архив `archive_file` из `apps/api/dist`, reserved concurrency 5), IAM-роль (`ses:SendEmail` на domain- и recipient-identity, `dynamodb:UpdateItem/GetItem` на таблицу, `logs:CreateLogStream/PutLogEvents` на свою группу), HTTP API с маршрутами `POST /api/lead` и `OPTIONS /api/lead` (throttling rate 5 / burst 10), log groups с retention 30 дней, alarm на ошибки Lambda.
- `dynamodb.tf` — таблица rate limit (`pk` S, TTL `expiresAt`, on-demand).
- `ses.tf` — domain identity `krunai.uz` (Easy DKIM) и email-identity получателя (для SES sandbox). DKIM-записи — output `ses_dkim_records`, добавляются вручную в ClouDNS.
- `cloudfront.tf` — второй origin на HTTP API и ordered behavior `/api/*`: CachingDisabled, AllViewerExceptHostHeader, все методы (CloudFront допускает POST/OPTIONS только в полном наборе). `locale-router` привязан только к default behavior.
- Перед `terraform plan` нужен `npm run build -w apps/api` (создаёт `apps/api/dist`).
