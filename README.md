# krunai.uz

Статический двуязычный (EN/RU) лендинг платформы KRunAI: Next.js (static export) на S3 + CloudFront, форма заявки через API Gateway + Lambda + SES. Регион AWS — eu-west-3.

Документация: [архитектура](docs/architecture.md), [деплой](docs/deploy.md), [DNS для клиента](docs/dns-cloudns.md), ADR в [docs/adr](docs/adr), ТЗ в [docs/spec](docs/spec).

## Структура

| Путь | Назначение |
|---|---|
| `apps/web` | Next.js 14 (статический экспорт) |
| `apps/api` | Lambda заявок (Python 3.12) |
| `infra/functions` | CloudFront Function `locale-router` |
| `infra/terraform` | Terraform (IaC) |
| `contracts/openapi.yaml` | OpenAPI-контракт `POST /contact` |
| `design/` | бренд-материалы |
| `e2e/` | Playwright E2E |
| `scripts/deploy/` | сборка `handoff.json` для клиента |
| `.github/workflows/` | CI (`ci.yml`) и деплой по тегу `release-*` (`deploy.yml`) |

## Локальная разработка

Нужны Node.js 20 LTS (`nvm use`) и Python 3.12.

```bash
npm install                                          # зависимости всех workspaces
npm run dev -w apps/web                              # сайт: http://localhost:3000/en/
npm run lint                                         # lint во всех workspaces
npm run test                                         # тесты во всех workspaces
npm run build                                        # сборка apps/web → out/

cd apps/api && pip install -r requirements-dev.txt   # Lambda: зависимости
cd apps/api && ruff check . && pytest                # Lambda: lint и тесты

node --test infra/functions/*.test.mjs scripts/deploy/*.test.mjs   # CloudFront Function и скрипты деплоя
```

Форма отправляет запрос на `NEXT_PUBLIC_LEAD_API_URL` (при сборке в деплое — `api_endpoint` + `/contact`). Чтобы проверить Lambda без реальной отправки писем, используйте `LEAD_EMAIL_DRY_RUN=true`: так работают тесты и E2E.

Локально `terraform apply` не запускайте: инфраструктура применяется только из GitHub Actions. Для проверки Terraform достаточно `terraform fmt -check -recursive` в `infra/terraform`.

## Деплой

Выкатка запускается с панели платформы («Выкатить» на странице `/aws`); push в `main` деплоя не запускает. Подробности, переменные и этапы — в [docs/deploy.md](docs/deploy.md). Таблица DNS для клиента — в [docs/dns-cloudns.md](docs/dns-cloudns.md).
