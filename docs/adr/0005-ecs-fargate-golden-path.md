# ADR 0005: ECS Fargate (web + api) за одним ALB — golden path

Статус: принято (заменяет ADR 0003 и часть ADR 0004)

## Context
ТЗ v4 (`docs/spec/v4-technical.md`, разделы 1, 4, 5) заменяет схему S3 + CloudFront + Lambda на golden path платформы: ECS Fargate в eu-west-3, два сервиса (web, api) за одним Application Load Balancer, backend на Python/FastAPI. Статический экспорт Next.js (ADR 0001/0002) больше не нужен: web запускается как Node-сервис. Функциональные требования к контенту, i18n и форме заявки не меняются.

## Decision
- **Сервисы ECS Fargate** (кластер один, 2 сервиса, по 1 задаче 0.25 vCPU / 0.5 GB, автоскейлинг до 2):
  - `web` — Next.js standalone, порт 3000 (`PORT=3000`, `HOSTNAME=0.0.0.0`), build-time `NEXT_PUBLIC_SITE_URL=https://krunai.uz`, `NEXT_PUBLIC_LEAD_API_PATH=/api/lead`.
  - `api` — Python 3.12 + FastAPI + uvicorn, порт 8000; `GET /api/health`, `POST /api/lead` (контракт без изменений).
- **ALB** один, listener 80 (и 443 после включения HTTPS, ADR 0006). Маршрутизация: `/api/*` → target group api, остальное → target group web. Регион eu-west-3.
- **Отказ** от CloudFront, S3 (статика), Lambda, API Gateway, DynamoDB и CloudFront Function. ACM-сертификат теперь в eu-west-3 (для ALB), а не в us-east-1.
- **Без БД.** Приложение ничего не хранит, заявки только уходят письмом через SES. Это осознанное отступление от golden path (PostgreSQL), т.к. хранить нечего; сохранение заявок — открытый вопрос ТЗ (§7).
- **Rate limit в памяти задачи** api: 5 заявок в `RATE_LIMIT_WINDOW_SECONDS=60` с IP (`RATE_LIMIT_MAX=5`). IP клиента — самый правый элемент `X-Forwarded-For` (его добавляет ALB; левые элементы подделываются клиентом). Ограничение: при 2 задачах счётчики независимы, фактический лимит — на задачу (до 10 в минуту суммарно). Принято как достаточное для формы заявок.
- **Локаль определяет Next.js middleware** (в web): `/` → 302 на `/{locale}/` по правилам ADR 0003 (cookie `lang` → `Accept-Language` с q → `en`, query сохраняется, `Cache-Control: no-store`); `/en/...`, `/ru/...` не редиректятся. Правила приоритета остаются из ADR 0003, меняется только место исполнения.
- **Health-check web через `/`.** Запрос ALB с `User-Agent`, начинающимся с `ELB-HealthChecker`, middleware пропускает без редиректа: `GET /` → 200. Для api — `GET /api/health` → 200 `{"status":"ok"}`.
- **Сети.** Используются публичные подсети в двух AZ, без NAT Gateway (экономия); задачам назначается публичный IP для доступа к ECR, CloudWatch Logs и SES. Security group ALB: вход только 80/443 из интернета. Security group задач: вход только от SG ALB на порты 3000 и 8000; других входящих нет.
- **Конфигурация api** через env задачи: `LEAD_RECIPIENT_EMAIL=gulmira@krunai.uz`, `LEAD_FROM_EMAIL=noreply@krunai.uz`, `AWS_REGION=eu-west-3`, `RATE_LIMIT_MAX=5`, `RATE_LIMIT_WINDOW_SECONDS=60`, `ALLOWED_ORIGINS=https://krunai.uz,https://www.krunai.uz`, `LEAD_EMAIL_DRY_RUN=false` (`true` — SES не вызывается, для тестов/e2e), `LOG_LEVEL=INFO`.
- **IAM.** Task role api: только `ses:SendEmail` на identity `krunai.uz`; все роли с `permissions_boundary_arn` (ADR 0006). Логи — CloudWatch Logs, 30 дней, email маскируется.

## Consequences
+ Соответствие golden path и платформенному пайплайну; один ALB, понятная маршрутизация.
+ Нет edge-слоя и зависимостей от us-east-1; меньше разнородных компонентов.
+ Локаль и редиректы живут в коде приложения и тестируются обычными средствами.
− Постоянная стоимость Fargate и ALB выше, чем у serverless-схемы.
− Rate limit приблизительный (память задачи, сброс при перезапуске, лимит на задачу при 2 задачах).
− Без CloudFront нет CDN-кэша: статические ассеты Next.js отдаёт сам сервис web (заголовки `Cache-Control` с `immutable` для хэшированных файлов).
− Публичные IP у задач; защита только security group (вход от ALB).
− Заявки не сохраняются: при сбое SES заявка теряется (клиент видит 500).

## Alternatives
- **Оставить S3 + CloudFront + Lambda** — отвергнуто ТЗ v4 (требование golden path).
- **Rate limit в DynamoDB/Redis** — отвергнуто: лишний сервис ради формы; лимит в памяти достаточен.
- **NAT Gateway / приватные подсети** — отвергнуто: ~30+ USD/мес ради сайта без БД; доступ ограничен SG.
- **Один сервис (Next.js проксирует API)** — отвергнуто: ТЗ требует два сервиса и backend на FastAPI.
- **Определение локали на ALB / в api** — невозможно/избыточно: ALB не умеет согласование языка.
- **Отдельный health-путь в web** — отвергнуто ТЗ: проверка через `/`, чтобы проверять реальную страницу.
