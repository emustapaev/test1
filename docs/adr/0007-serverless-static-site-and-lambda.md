# ADR 0007: Serverless-архитектура v5 — S3 + CloudFront + API Gateway + Lambda + SES

Статус: принято (заменяет ADR 0005; восстанавливает ADR 0003; изменяет ADR 0006)

## Context
ТЗ v5 (`docs/spec/v5-technical.md`, разделы 1–6) фиксирует «базовый вариант»: сайт и форма на почту с бюджетом ≈$0/мес. ECS Fargate и ALB (ADR 0005) дают постоянную стоимость и не входят в согласованное решение. Деплой по контракту платформы (`docs/platform-contract.md`, ADR 0006) остаётся обязательным.

## Decision
- **Регион** eu-west-3 (Paris); ACM-сертификат для CloudFront — в us-east-1 (provider alias).
- **Frontend:** Next.js + TypeScript + Tailwind, `output: 'export'`, i18n EN/RU (ADR 0001/0002). Build-time: `NEXT_PUBLIC_SITE_URL=https://krunai.uz`, `NEXT_PUBLIC_LEAD_API_URL` = invoke URL API Gateway + `/contact`.
- **Хостинг:** S3 (private, Block Public Access, OAC) + CloudFront (HTTPS only, redirect HTTP→HTTPS, сжатие, кэширование ассетов). Прямой доступ к S3 — 403.
- **CloudFront Function** viewer-request (ADR 0003): `www.krunai.uz` → 301 `https://krunai.uz{path}?{query}`; `/` → 302 на `/{lang}/` по cookie `lang` → `Accept-Language`; переписывание `/x/` → `/x/index.html`.
- **Форма:** API Gateway HTTP API (`$default` stage) `POST /contact` → Lambda (Python 3.12) → SES v2 (eu-west-3). From `noreply@krunai.uz`, To `gulmira@krunai.uz`, Reply-To — email посетителя. Контракт — `contracts/openapi.yaml`.
- **Lambda env:** `LEAD_RECIPIENT_EMAIL=gulmira@krunai.uz`, `LEAD_FROM_EMAIL=noreply@krunai.uz`, `LEAD_EMAIL_DRY_RUN=false`, `LOG_LEVEL=INFO`.
- **Антиспам:** honeypot `website` (200 без письма, лог `honeypot_triggered` без PII) и throttling stage API Gateway (`api_throttle_rate=5`, `api_throttle_burst=10`) → 429. Другого rate limit нет; DynamoDB для счётчиков не используется.
- **Безопасность письма:** CR/LF в `name` и `email` → `invalid_format` (header injection).
- **CORS** API: `https://krunai.uz` и localhost для dev.
- **Хранения заявок нет:** ни DynamoDB, ни S3 для payload; заявка уходит только письмом.
- **SES:** domain identity `krunai.uz`, Easy DKIM (3 CNAME), custom MAIL FROM `mail.krunai.uz` (MX + TXT SPF на поддомене). Корневые MX/SPF/DMARC Zoho не трогаются (ADR 0004). IAM Lambda: `ses:SendEmail` на identity и запись в свои логи, с `permissions_boundary_arn`.
- **Observability:** CloudWatch Logs (`log_retention_days=30`), без PII; alarms: Lambda Errors > 0, Lambda Throttles, SES Bounce/Complaint rate, API Gateway 5xx; SNS → `alarm_email`.
- **Не используются:** DynamoDB (кроме таблицы блокировок state платформы), WAF, ALB, Fargate/ECS/ECR, NAT, RDS, Route 53.

## Consequences
+ Стоимость ≈$0 в пределах free tier; нет постоянно работающих платных ресурсов.
+ CDN-кэш, HTTPS на edge, нет публичных IP и security group для управления.
− Throttling API Gateway — общий на stage, а не по IP: один клиент может исчерпать лимит для всех. Принято для формы заявок.
− Тело ответа 429 генерирует API Gateway, не гарантировано; фронт ориентируется на статус.
− При сбое SES заявка теряется (500), хранения нет.
− Список локалей дублируется в CloudFront Function (architecture.md, раздел 7).
− Данные транзитом проходят через eu-west-3 (юридический вопрос ТЗ §7).

## Alternatives
- **ECS Fargate + ALB (ADR 0005)** — отвергнуто ТЗ v5: постоянная стоимость, вне базового варианта.
- **Rate limit по IP в DynamoDB** — отвергнуто: лишний сервис, throttling достаточно.
- **WAF rate-based rule** — отвергнуто: платный постоянный ресурс.
- **Lambda function URL вместо API Gateway** — отвергнуто ТЗ: требуется throttling stage и HTTP API.
