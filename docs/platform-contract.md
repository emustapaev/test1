# Контракт платформы AI Dev Team: деплой в AWS клиента

Этот файл кладёт в репозиторий платформа (ADR-025 платформы). Это обязательные правила: код проекта
не меняет этот файл и не обходит его. Если правило мешает требованию ТЗ — опиши конфликт в итоге PR.

## Что уже есть (создано стеком `ai-team-access` в AWS клиента)
Клиент подключает AWS сам, кнопкой в Telegram. После этого платформа прописывает в репозиторий
переменные GitHub Actions (Settings → Secrets and variables → Actions → Variables):

| Переменная | Что это |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | роль деплоя `ai-team-deploy` (OIDC, доверяет только тегам `release-*` этого репозитория) |
| `AWS_REGION` | основной регион проекта |
| `AWS_ACCOUNT_ID` | AWS-аккаунт клиента |
| `AWS_PERMISSIONS_BOUNDARY_ARN` | граница прав `ai-team-boundary` |
| `TF_STATE_BUCKET` | S3-бакет для Terraform state (версионирование, шифрование) |
| `TF_LOCK_TABLE` | DynamoDB-таблица блокировок Terraform (ключ `LockID`) |

Не создавай свои OIDC-провайдеры, роли деплоя, бакеты state или «bootstrap»-конфигурации — они уже есть.
Эти переменные (и любые с префиксами `AWS_`, `AI_TEAM_`, `GITHUB_`) задаёт только платформа.

## Workflow деплоя `.github/workflows/deploy.yml`
- Триггер — **только** тег `release-*`. Тег ставит платформа после подтверждения клиента в Telegram —
  это гейт деплоя в prod: роль AWS принимает только запуски по таким тегам, из `main`, PR или вручную
  войти в неё нельзя. Других триггеров (`branches`, `pull_request`, `schedule`, `workflow_dispatch`) нет:
  ```yaml
  on:
    push:
      tags: ["release-*"]
  ```
  Теги `release-*` вручную не создавай.
- `permissions: id-token: write, contents: read`; вход в AWS:
  ```yaml
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
      aws-region: ${{ vars.AWS_REGION }}
  ```
- Без GitHub Environments и без долгоживущих ключей.
- `concurrency: { group: deploy, cancel-in-progress: false }`.
- `actions/checkout` берёт коммит тега (по умолчанию так и есть) — выкатывается ровно одобренная версия.
- Перед apply — те же сборка и тесты, что в CI.

## Infrastructure as Code
- Terraform (рекомендуется) с backend S3:
  `bucket = vars.TF_STATE_BUCKET`, `dynamodb_table = vars.TF_LOCK_TABLE`, `region = vars.AWS_REGION`,
  `encrypt = true`, ключ state — `<проект>/terraform.tfstate`. Либо CloudFormation/SAM (state не нужен).
- **Каждая IAM-роль**, которую создаёт IaC (Lambda, ECS и т.п.), обязана иметь
  `permissions_boundary = AWS_PERMISSIONS_BOUNDARY_ARN` (передавай как `TF_VAR_permissions_boundary_arn`).
  Без границы AWS откажет в создании роли. Имена ролей и политик не должны начинаться с `ai-team-`.
- Пользователи IAM, ключи доступа, изменения аккаунта/Organizations запрещены границей прав.
- Ресурсы, которым нужен us-east-1 (сертификат ACM для CloudFront), — через provider alias.
- Настройки проекта (домен, e-mail, флаги этапов) — значения по умолчанию в коде или переменные
  с префиксом проекта, которые меняет платформа через `after_dns.set_variables` (см. ниже).

## Передача клиенту: артефакт `client-handoff`
В конце успешного деплоя workflow загружает артефакт `client-handoff` с файлом `handoff.json`.
Платформа читает его, отправляет клиенту в Telegram DNS-записи простым языком, сама проверяет
их появление и выполняет `after_dns`:

```json
{
  "zone": "example.com",
  "site_url": "https://d1234abcd.cloudfront.net",
  "dns_records": [
    {"type": "CNAME", "name": "_abc.example.com", "value": "_def.acm-validations.aws",
     "purpose": "подтверждение SSL-сертификата"}
  ],
  "after_dns": {"set_variables": {"ENABLE_CUSTOM_DOMAIN": "true"}, "redeploy": true}
}
```

- `zone` — домен клиента; все `name` — полные имена внутри зоны (`example.com` для корня).
- `type`: `A`, `AAAA`, `CNAME`, `ALIAS` (ANAME, для корня домена), `TXT`, `MX`. До 30 записей.
- `dns_records` — **все** записи, которые должны быть у клиента на этом этапе (платформа покажет только
  отсутствующие). Существующие записи клиента (почта, SPF, DMARC) не перечисляй и не меняй.
- `site_url` — адрес, по которому сайт работает сейчас.
- `after_dns` — что сделать, когда все записи на месте: задать переменные Actions (до 10) и перезапустить
  деплой. Повторный деплой платформа делает только если значение переменной реально изменилось,
  поэтому этапы «сначала сертификат → потом домен» описываются одним и тем же `handoff.json`.
- Пример загрузки:
  ```yaml
  - uses: actions/upload-artifact@v4
    with: { name: client-handoff, path: handoff.json, if-no-files-found: error }
  ```

## Что делает платформа, а не код проекта
Запуск деплоя (тег `release-*`), общение с клиентом, проверка DNS, выдача доступа к AWS, алерты о сбоях деплоя.
