# Security-review v5: Terraform, Lambda, CloudFront Function, workflows

Дата: 2026-10-26. Метод: чтение кода и конфигурации; `plan`/`apply` и запросы к AWS не выполнялись. Код не менялся.
Модель угроз: `docs/security/threat-model.md`. Тикет: #139, ТЗ: `docs/spec/v5-technical.md` (2.4, 4, 5, 7).

> Замечание: в тикете упомянут `infra/functions/edge-router.js`; в репозитории файл называется `infra/functions/locale-router.js` — ревью выполнено по нему.

## Сводная таблица находок

Severity: Critical / High / Medium / Low / Info. Статус: Открыто (требует исправления), Принято (риск осознан), ОК (проверено, замечаний нет).

| ID | Область | Находка | Severity | Статус |
|----|---------|---------|----------|--------|
| F-01 | CloudFront, CSP | `connect-src 'self'` блокирует `fetch` формы на `https://<id>.execute-api.eu-west-3.amazonaws.com/contact`: форма не работает в браузере | High (функциональный отказ из-за security-заголовка) | Открыто |
| F-02 | deploy.yml | Сторонний код (`npm ci`, `pip install`, `npx @redocly/cli`) исполняется в job с `id-token: write` и тегово-доверяющей ролью деплоя | Medium | Открыто |
| F-03 | API GW, Lambda, SES | Нет защиты от спама по клиенту: throttling общий на stage, нет reserved concurrency; атакующий забивает лимит (отказ формы для всех) или шлёт письма на ящик и портит репутацию SES | Medium | Открыто |
| F-04 | CORS | В prod разрешены `http://localhost:3000` и cloudfront-домен | Low | Принято/смягчить |
| F-05 | e2e.yml | `workflow_run` с `branches: [main]` не срабатывает после деплоя по тегу; e2e checkout берёт `main`, а не выкаченный коммит; есть `workflow_dispatch` | Low | Открыто |
| F-06 | Lambda validation | NUL/необычные символы в email проходят regex и дают 500 вместо 400; нет явного лимита размера тела до парсинга | Low | Открыто |
| F-07 | IAM | Политика SES — только ARN domain identity; в sandbox получатель проверяется отдельно, нужна проверка на стенде. `aws_lambda_permission` на `/*/*` шире нужного | Low | Открыто |
| F-08 | Workflows | Actions закреплены по мажорному тегу, не по SHA; `npx --yes` без версии | Low | Открыто |
| F-09 | Логи | PII в логах не найдено; риск регрессии при смене `LOG_LEVEL`/добавлении логирования | Info | ОК (+тест) |
| F-10 | CF Function | Query string в `Location` не перекодируется | Low | Принято |
| F-11 | Правовой | Требования Узбекистана к локализации ПДн граждан | High (правовой) | Открыто — решение клиента |
| F-12 | S3 | Нет versioning и access-логов бакета сайта; SSE-S3 | Info | Принято |
| F-13 | Terraform | Неиспользуемая переменная `ses_verify_recipient`; email identity получателя не создаётся | Info | Открыто |
| F-14 | deploy.yml | Триггер только `release-*`, permissions, concurrency, OIDC — соответствуют контракту | — | ОК |
| F-15 | S3 | Прямой доступ → 403, OAC, BPA, deny без TLS | — | ОК |
| F-16 | IAM | Lambda role: boundary, `ses:SendEmail` на identity + свои логи, без wildcard-ресурсов | — | ОК |
| F-17 | Lambda | CR/LF в name/email отклоняются; Subject — константа; Reply-To структурно | — | ОК |

## Проверки из критериев приёмки

| Проверка | Результат |
|---|---|
| S3 403 | ОК. `aws_s3_bucket_public_access_block` (4 флага), `BucketOwnerEnforced`, политика разрешает только `cloudfront.amazonaws.com` при `AWS:SourceArn` = дистрибуция, deny при `aws:SecureTransport=false`. Прямой GET на бакет → 403. Отсутствующие ключи → 403 от S3 (нет `ListBucket`), CloudFront переписывает в 404 `/404.html` |
| CORS | Соответствует ТЗ: `https://krunai.uz`, cloudfront-домен, `http://localhost:3000`; методы POST/OPTIONS; заголовок `content-type`; без `*` и без credentials. Замечания F-04. CORS не защищает от прямых запросов (curl) — см. F-03. **Важно:** CORS на API корректен, но CSP на сайте блокирует вызов (F-01) |
| Least privilege | ОК (F-16): `ses:SendEmail` на `aws_sesv2_email_identity.domain.arn`, логи на `${log_group.arn}:*`. Нет `*`-ресурсов и лишних действий. Замечания F-07 |
| Boundary | ОК. `permissions_boundary = var.permissions_boundary_arn` у единственной IAM-роли; переменная без default (деплой падает без границы), имя роли `krunai-prod-lead-lead-role` не начинается с `ai-team-`. Пользователей IAM и ключей нет. Роли деплоя/OIDC в репозитории не создаются |
| CR/LF | ОК (F-17). `name`/`email` с `\r`/`\n` → 400 `invalid_format`; Subject = `[EN|RU] New lead from krunai.uz`, пользовательский ввод в заголовки не попадает; `Reply-To` — `ReplyToAddresses` (SES v2 API, не сырой MIME). CF Function: Location строится из констант и `lang` из allow-list. Замечание F-06 |
| Логи без PII | ОК (F-09). Lambda: `event`, `request_id`, `status`, `lang`, `honeypot`, `error_type`; исключение логируется только типом. Access-лог API: `requestId`, `routeKey`, `status`, `latency` (без IP, тела, заголовков). `honeypot_triggered` без PII — по ТЗ. CF Function не пишет логов; CloudFront access logs не включены |
| Триггеры deploy.yml | ОК (F-14). Только `push: tags: ["release-*"]`; нет `branches`, `pull_request`, `schedule`, `workflow_dispatch`; `permissions: id-token: write, contents: read`; `concurrency: deploy`; без ключей и Environments. Тег в `run`-скриптах не используется (нет script injection). Замечания F-02, F-08 |

## Подробности и рекомендации

### F-01 (High): CSP блокирует форму
`cloudfront.tf`: `connect-src 'self'`. По v5 форма вызывает API напрямую (`NEXT_PUBLIC_LEAD_API_URL = <api_endpoint>/contact`, `apps/web/src/lib/leadApi.ts`), а не через CloudFront (в v5 нет `/api/*` behavior; прежняя модель угроз исходила из same-origin). Браузер заблокирует `fetch` по CSP до CORS.
Исправление: добавить в `connect-src` точный origin API (`aws_apigatewayv2_api.lead.api_endpoint`) вместо wildcard; в ресурсе `aws_cloudfront_response_headers_policy.security` использовать ссылку на атрибут (в Terraform нет цикла: API не зависит от CloudFront, кроме `local.cloudfront_url` в CORS API — цикл `API → CloudFront → API`! Решение: брать для CORS не атрибут дистрибуции, либо разрешить в CSP `https://*.execute-api.eu-west-3.amazonaws.com`). Проверить после выкатки в браузере (DevTools → Console), не только `curl`.

### F-02 (Medium): секреты OIDC доступны стороннему коду
Все шаги одного job выполняются с переменными `ACTIONS_ID_TOKEN_REQUEST_*`; зависимость из `npm ci`/`pip install`/`npx` может запросить OIDC-токен и войти в роль (доверие — тег `release-*`). Порядок «`configure-aws-credentials` после тестов» не защищает от этого.
Исправление: разделить на job'ы. `verify` (lint, тесты, `npm ci`, `pip install`, openapi lint) — `permissions: contents: read`, без `id-token`. `deploy` (`needs: verify`, `id-token: write`) — только `terraform`, `aws`, `jq` и `node scripts/deploy/build-handoff.mjs` (без сторонних зависимостей). Сложность: сборка web зависит от `api_endpoint` из `terraform apply`, поэтому её нужно либо вынести в третий job без `id-token` (получает `api_endpoint` как output deploy-job, артефакт `apps/web/out` возвращается в выкладку), либо оставить в deploy-job и принять риск `npm ci` по lock-файлу. Минимум: закрепить версию `@redocly/cli`, использовать `pip install --require-hashes`.
Ограничение: `docs/platform-contract.md` задаёт триггеры и вход в AWS, но не запрещает несколько job; изменение допустимо.

### F-03 (Medium): нет защиты по клиенту
Throttling `5 rps/burst 10` общий на stage: один источник может держать 429 для всех посетителей; 5 rps ≈ 430 тыс. писем в сутки до срабатывания SES-квоты и аларма bounce/complaint. Honeypot обходится скриптом, знающим схему. Ограничения ТЗ: WAF и хранилище состояния запрещены.
Рекомендации в рамках бюджета: (1) `reserved_concurrent_executions` Lambda = 2–5 (ограничивает параллелизм/стоимость; учесть, что quota аккаунта должна позволять); (2) снизить throttling до фактических объёмов (~1000 заявок/мес; например 1 rps / burst 5); (3) добавить аларм на число отправок SES (`AWS/SES Send` > N/час) и/или бюджет; (4) при росте спама — Turnstile/hCaptcha или WAF rate-based rule (требует согласования бюджета). Остаточный риск принять явно.

### F-04 (Low): CORS
`http://localhost:3000` разрешён по ТЗ (dev), но в prod расширяет доверие: страница на localhost посетителя сможет слать заявки — риска для данных нет (CORS не аутентифицирует). Рекомендация: добавить переменную `cors_extra_origins` и в prod оставить только `https://krunai.uz` + cloudfront-домен (нужен на этапе 1 до DNS). Cloudfront-домен после подключения домена можно убрать. Решение за владельцем: исправление не критично.

### F-05 (Low): e2e.yml
Для запусков по тегу `head_branch` равен имени тега, поэтому условие `branches: [main]` не выполняется, и e2e после деплоя не запустится. Кроме того, при срабатывании `workflow_run` checkout берёт `main`, а не выкаченный коммит; `BASE_URL` — prod. Секретов и AWS-доступа нет, поэтому риск Low. Рекомендация: убрать фильтр `branches` и использовать `ref: ${{ github.event.workflow_run.head_sha }}`; по контракту платформы деплой-триггер не менять (e2e — отдельный workflow, он контрактом не регулируется).

### F-06 (Low): валидация
`EMAIL_RE` исключает пробелы, но не NUL и прочие управляющие символы; SES отвечает ошибкой → Lambda возвращает 500 и срабатывает аларм Errors (ложный сигнал, ресурс для шума). Рекомендации: отклонять `\x00-\x1f\x7f` в name/email (`invalid_format`); нормализовать/отклонять не-ASCII локальную часть email, пока SES не принимает её в Reply-To; ограничить размер тела (`len(raw) > 20000` → 400 до `json.loads`). Тело письма — `text/plain`, HTML-инъекции нет; в тексте сообщения возможна подделка строк «Email: …» — информационно.

### F-07 (Low): IAM
(а) В SES sandbox получатель — верифицированная identity; при resource-level проверке IAM может потребовать права и на неё. Домен-identity покрывает адрес `gulmira@krunai.uz` по ARN identity домена, но поведение нужно подтвердить на стенде отправкой тестовой заявки до приёмки (деплой пока не выполнялся). Не расширять политику на `*`. (б) `aws_lambda_permission.api.source_arn = ".../*/*"` — сузить до `/*/POST/contact`.

### F-08 (Low): supply chain в workflows
Actions закреплены `@v4/@v5`. Для `id-token`-job рекомендуется SHA-пиннинг (с Dependabot для `github-actions`). `npx --yes @redocly/cli` без версии выполняет произвольную актуальную версию — закрепить.

### F-09 (Info): PII в логах
Дополнительно: тесты проверяют отсутствие PII? Рекомендуется unit-тест `caplog`, что после запроса с name/email/message в логах нет этих значений (в `apps/api/tests`). Не включать отладку `boto3` (`LOG_LEVEL=DEBUG` не логирует тело в коде проекта, но botocore DEBUG может). Срок хранения логов 30 дней (в пределах 14–30 по ТЗ).

### F-10 (Low): query в Location
`buildQuery` подставляет значения как есть. Хост и схема фиксированы, CR/LF в заголовок не попадут. Принято; при желании — `encodeURIComponent` для значений, но это изменит байтовое равенство query (AC `?x=1` сохраняется).

### F-11 (High, правовой): локализация ПДн
Через форму идут ПДн (имя, email, текст). Закон Республики Узбекистан «О персональных данных» (точную редакцию и статью должен подтвердить юрист) требует, по формулировке ТЗ, хранить и обрабатывать ПДн граждан Узбекистана в базах на территории страны; возможны штрафы и ограничение доступа к ресурсу (уточнить у юриста). В базовом варианте данные не хранятся в AWS, но проходят через eu-west-3 (API Gateway, Lambda, SES) и осядут в Zoho Mail (юрисдикция/ЦОД Zoho вне Узбекистана). Вопрос, считается ли транзит и почтовый ящик «хранением/базой», — юридический, не технический. Не является юридической консультацией.
Рекомендации клиенту: (1) проконсультироваться с юристом до запуска; (2) не вводить расширенный вариант с копией заявок в AWS без вывода; (3) добавить на сайт уведомление о сборе и обработке ПДн (политика конфиденциальности, согласие у формы); (4) при необходимости — альтернатива «mailto» без передачи через зарубежную инфраструктуру или размещение обработки в стране; (5) зафиксировать срок хранения писем в ящике. Технические меры (минимизация, нет хранилища, нет PII в логах) уже сокращают объём риска.

### F-12/F-13 (Info)
F-12: бакет содержит только пересобираемую статику; versioning/access logs не обязательны. F-13: `ses_verify_recipient` объявлена, но не используется — удалить или реализовать (`aws_sesv2_email_identity` для получателя нужна только в sandbox, и при домене `krunai.uz` с Zoho получатель покрыт identity домена).

## Список исправлений (критичные и важные, по приоритету)

1. **F-01 (High)** — добавить origin API в CSP `connect-src` (без wildcard-схем вроде `https:`); разобрать цикл зависимостей CloudFront↔API. Проверить отправку формы в браузере. Блокирует функциональный критерий приёмки ТЗ 2.3.
2. **F-02 (Medium)** — отделить недоверенные шаги (npm/pip/npx) от job с `id-token: write`.
3. **F-03 (Medium)** — `reserved_concurrent_executions`, снизить throttling, аларм на объём отправок SES; принять остаточный риск.
4. **F-11 (High, правовой)** — решение клиента после консультации юриста; добавить уведомление о ПДн на сайт.
5. F-05, F-06, F-07, F-08 — плановые правки (Low).

Исправления выполняются отдельными тикетами; в данном тикете код не менялся.
