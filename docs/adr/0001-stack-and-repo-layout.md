# ADR 0001: Стек и раскладка монорепозитория

Статус: принято

## Context
Нужен одностраничный сайт krunai.uz (EN/RU) с одной формой заявки на AWS eu-west-3, минимальной стоимостью в простое и IaC/CI/CD. ТЗ v1 прямо отступает от golden path (ECS Fargate, FastAPI, PostgreSQL): сайт статический, у формы одно действие, БД не нужна.

## Decision
- Фронтенд: Next.js 14 App Router, TypeScript strict, Tailwind, `output: 'export'`, `trailingSlash: true`. Runtime-сервера нет.
- Хостинг: S3 (приватный) + CloudFront с OAC; ACM в us-east-1, остальное в eu-west-3.
- Заявки: API Gateway HTTP API + Lambda (Node.js 20 + TypeScript, esbuild; см. ТЗ v2) + SES; DynamoDB только для rate limit (с TTL), заявки не хранятся. Маршрут `POST /api/lead` через behavior `/api/*` в CloudFront.
- Edge: единственный runtime-компонент — CloudFront Function (ADR 0003). Lambda@Edge не используется.
- IaC: Terraform >= 1.6, AWS provider ~> 5. CI/CD: GitHub Actions + OIDC.
- Node.js 20 LTS (`.nvmrc`), npm workspaces.
- Монорепо: `apps/web`, `apps/api`, `e2e` — workspaces; `infra/functions`, `infra/terraform`, `contracts`, `design`, `.github/workflows`, `docs` — не пакеты. Корневые скрипты `lint`/`test`/`build` делегируют в workspaces через `--if-present`.
- `apps/api` — Node 20 + TypeScript (vitest, esbuild → `dist/handler.js`); изначально планировался Python, заменён по тикету T11.

## Consequences
+ Минимальная стоимость и обслуживание, масштабирование «из коробки», один деплой-артефакт для фронта (`out/`).
+ Единые команды для разработчиков и CI.
− Два языка в репозитории (TypeScript и Python); обёртка package.json для Python — небольшая условность.
− DynamoDB добавляет один managed-ресурс ради rate limit (throttling API GW сам по себе не ограничивает по клиенту).
− Статический экспорт исключает возможности Next.js, требующие сервера (middleware, ISR, rewrites): они заменяются CloudFront Function.
