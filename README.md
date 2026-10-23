# krunai.uz

Статический двуязычный (EN/RU) лендинг платформы KRunAI: Next.js (static export) на S3 + CloudFront, форма заявки через API Gateway + Lambda + SES. Регион AWS — eu-west-3.

Документация: [архитектура](docs/architecture.md), ADR в [docs/adr](docs/adr), ТЗ в [docs/spec](docs/spec).

## Структура

| Путь | Назначение |
|---|---|
| `apps/web` | Next.js 14 (статический экспорт) |
| `apps/api` | Lambda заявок (Python 3.12) |
| `infra/functions` | CloudFront Function `locale-router` |
| `infra/terraform` | Terraform (IaC) |
| `contracts/openapi.yaml` | OpenAPI-контракт `POST /api/lead` |
| `design/` | бренд-материалы |
| `e2e/` | Playwright E2E |
| `.github/workflows/` | CI/CD |

## Требования и команды

Node.js 20 LTS (`nvm use`), npm workspaces.

```bash
npm install        # установка зависимостей всех workspaces
npm run lint       # lint во всех workspaces
npm run test       # тесты во всех workspaces
npm run build      # сборка (apps/web → out/)
```

Скрипты делегируют в workspaces `apps/web`, `apps/api`, `e2e` (там, где они объявлены). Приложения, Terraform и контракт добавляются отдельными тикетами.
