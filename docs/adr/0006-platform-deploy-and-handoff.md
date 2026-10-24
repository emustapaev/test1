# ADR 0006: Деплой по контракту платформы, двухэтапный HTTPS и handoff

Статус: принято (заменяет деплой из ADR 0004 и прежний CI/CD из `main`)

## Context
ТЗ v4 (§2, §3) и `docs/platform-contract.md`: доступ к AWS даёт платформа (стек `ai-team-access`, кнопка «Подключить AWS»), деплой — только по тегу `release-*` после подтверждения клиента («Выкатить»), роль деплоя, Terraform state и переменные Actions уже существуют. Клиент вносит DNS-записи в ClouDNS по таблице от бота; выкатка не ждёт DNS. Прежние `infra/terraform/bootstrap` (OIDC-роль оператора) и деплой из `main` противоречат контракту.

## Decision
- **`deploy.yml` только по тегу.** `on: push: tags: ["release-*"]`, без `branches`, `pull_request`, `schedule`, `workflow_dispatch`; `permissions: id-token: write, contents: read`; вход через `aws-actions/configure-aws-credentials@v4` с `vars.AWS_DEPLOY_ROLE_ARN` и `vars.AWS_REGION`; `concurrency: {group: deploy, cancel-in-progress: false}`; перед apply те же сборка и тесты, что в CI. Теги вручную не создаются.
- **CI** (`ci.yml`) только собирает, линтит, тестирует и собирает Docker-образы; в AWS не деплоит и ключей не имеет.
- **Роль, state, переменные платформы.** Роль `ai-team-deploy` (`AWS_DEPLOY_ROLE_ARN`), `AWS_REGION`, `AWS_ACCOUNT_ID`, `AWS_PERMISSIONS_BOUNDARY_ARN`, `TF_STATE_BUCKET`, `TF_LOCK_TABLE` задаёт платформа. Terraform backend S3: `bucket=TF_STATE_BUCKET`, `dynamodb_table=TF_LOCK_TABLE`, `region=AWS_REGION`, `encrypt=true`, key `test1/terraform.tfstate`. Каждая IAM-роль в IaC получает `permissions_boundary = var.permissions_boundary_arn` (`TF_VAR_permissions_boundary_arn`), имена не начинаются с `ai-team-`. (DynamoDB здесь — только таблица блокировок платформы, не компонент приложения.)
- **Порядок деплоя:** создать ECR и остальную инфраструктуру → собрать и запушить образы web/api (тег = SHA коммита) → `terraform apply` с `web_image`, `api_image` → стабилизация ECS-сервисов → формирование и загрузка `handoff.json`.
- **Двухэтапный HTTPS** через переменную Actions `KRUNAI_ENABLE_HTTPS` (`TF_VAR_enable_https`, по умолчанию `false`):
  - Этап 1 (`false`): создаются ALB (listener 80 → forward, `/api/*` → api, default → web), ECS, ECR, SES identity, ACM-сертификат (ожидающий валидации). `site_url = http://<alb_dns_name>`; `POST /api/lead` работает по HTTP.
  - Клиент добавляет DNS-записи; платформа проверяет их и выставляет `KRUNAI_ENABLE_HTTPS=true`, затем перезапускает деплой (`after_dns`).
  - Этап 2 (`true`): `aws_acm_certificate_validation`, listener 443 (ELBSecurityPolicy-TLS13-1-2-2021-06), listener 80 → 301 `https://krunai.uz:443#{path}?#{query}`, правило host `www.krunai.uz` → 301 `https://krunai.uz`. `site_url = https://krunai.uz`.
- **Outputs Terraform:** `alb_dns_name`, `alb_zone_id`, `acm_validation_records` (`[{name,type,value}]`), `ses_dkim_records`, `ses_mail_from_records`, `ecr_web_repository_url`, `ecr_api_repository_url`, `ecs_cluster_name`, `ecs_web_service_name`, `ecs_api_service_name`, `site_url`, `dns_records` (`[{type,name,value,purpose}]`, все записи §3 ТЗ: ACM, ALIAS apex, CNAME www, 3 DKIM, MX и TXT `mail`). Записи Zoho не входят.
- **`handoff.json`** (артефакт `client-handoff`, `if-no-files-found: error`):
  ```json
  {
    "zone": "krunai.uz",
    "site_url": "http://<alb_dns>",
    "dns_records": [{"type": "CNAME", "name": "...", "value": "...", "purpose": "..."}],
    "after_dns": {"set_variables": {"KRUNAI_ENABLE_HTTPS": "true"}, "redeploy": true}
  }
  ```
  `site_url` — `http://<alb_dns>` пока `enable_https=false`, иначе `https://krunai.uz`; `dns_records` = output `dns_records` (до 30 записей, все нужные на этом этапе); имена полные внутри зоны.
- **Fallback без ALIAS:** `canonical_host = "www.krunai.uz"`: www — CNAME на ALB, apex — веб-редирект ClouDNS; `NEXT_PUBLIC_SITE_URL`, canonical/hreflang и sitemap синхронизируются. В ALB правило переворачивается (apex → 301 на www).
- **Удаляется:** `infra/terraform/bootstrap`, `deploy.yml` с триггером из `main`, шаги про роль оператора и ручной сигнал «готово». Задача по удалению — отдельные тикеты эпика.

## Consequences
+ Деплой гейтится подтверждением клиента; нет долгоживущих ключей и самодельных ролей.
+ Выкатка не блокируется на DNS; повторный деплой детерминирован и инициируется платформой.
+ Все DNS-значения машиночитаемы (outputs и `handoff.json`).
− Любое изменение в prod требует тега `release-*` от платформы: нет быстрого ручного деплоя.
− Пока `enable_https=false`, сайт доступен только по HTTP на DNS-имени ALB; сертификат не привязан.
− Fallback на `www` меняет канонический URL.
− Лимит 30 записей в `handoff.json` (в схеме ~8–9).

## Alternatives
- **Деплой из `main` по OIDC-роли из bootstrap** — отвергнуто контрактом платформы.
- **`workflow_dispatch` для ручного запуска** — запрещено контрактом.
- **Один apply с ожиданием ACM-валидации** — отвергнуто: ждёт ручного DNS клиента.
- **HTTPS сразу, HTTP-only этапа нет** — отвергнуто: блокировало бы первую выкатку.
- **Route 53 с делегированием NS** — отвергнуто (ADR 0004): риск для почты Zoho.
