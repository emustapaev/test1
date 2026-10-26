# Деплой krunai.uz

Деплой идёт только из GitHub Actions (`.github/workflows/deploy.yml`) через OIDC-роль, которую создаёт платформа. Долгоживущих AWS-ключей нет. Регламент платформы: [platform-contract.md](platform-contract.md).

## Кто что делает

| Шаг | Кто |
|---|---|
| Подключает AWS (кнопка «Подключить AWS») и задаёт переменные Actions | Платформа |
| Нажимает «Выкатить» на странице `/aws` и ставит тег `release-*` | Клиент через платформу |
| Запускает `terraform apply`, сборку и выгрузку сайта, создаёт `handoff.json` | GitHub Actions |
| Присылает клиенту таблицу DNS, проверяет записи, включает домен | Платформа (бот) |
| Вносит DNS-записи в панели | Клиент, по [dns-cloudns.md](dns-cloudns.md) |

## 1. Переменные Actions

Платформа задаёт их сама. Вручную ничего настраивать не нужно.

| Переменная | Назначение |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | OIDC-роль для деплоя |
| `AWS_REGION` | `eu-west-3` |
| `AWS_ACCOUNT_ID` | аккаунт клиента |
| `AWS_PERMISSIONS_BOUNDARY_ARN` | граница прав для всех IAM-ролей стека |
| `TF_STATE_BUCKET`, `TF_LOCK_TABLE` | S3-бакет state и таблица блокировок (S3 backend, key `test1/terraform.tfstate`) |
| `KRUNAI_ENABLE_CUSTOM_DOMAIN` | этап домена: `false` по умолчанию, `true` после включения домена |

## 2. Выкатка

1. Клиент нажимает «Выкатить» на `/aws`. Платформа ставит тег `release-*`.
2. `deploy.yml` — единственный деплойный триггер (push в ветки и PR его не запускают):
   - lint и тесты (как в CI): web lint и i18n, ruff, pytest, тесты CloudFront Function и скриптов деплоя, `terraform fmt`, OpenAPI lint;
   - `terraform init` / `validate` / `apply`;
   - сборка web с `NEXT_PUBLIC_LEAD_API_URL` = `api_endpoint` + `/contact`;
   - `aws s3 sync` в бакет сайта, инвалидация CloudFront `/*`;
   - артефакт `client-handoff` с файлом `handoff.json`.
3. Платформа читает `handoff.json` и присылает клиенту таблицу DNS.

Одновременно выполняется только один деплой (`concurrency: deploy`, отмена не используется).

## 3. Этап 1: сайт на `*.cloudfront.net`

При `KRUNAI_ENABLE_CUSTOM_DOMAIN=false` сайт и форма работают по `site_url` (`https://<id>.cloudfront.net`). Apply не ждёт подтверждения сертификата ACM, поэтому деплой завершается сразу. Сертификат и DKIM-записи ждут DNS-записей клиента.

## 4. Этап 2: включение домена `krunai.uz`

Когда клиент внёс записи из таблицы и они появились в DNS, платформа ставит `KRUNAI_ENABLE_CUSTOM_DOMAIN=true` и запускает деплой повторно. Apply дожидается выдачи сертификата ACM и привязывает `krunai.uz` и `www.krunai.uz` к CloudFront. Для этого в `handoff.json` есть блок `after_dns`: переменная и повторный запуск. Повторный деплой платформа запускает только если значение переменной реально изменилось.

## 5. Fallback: `www` как основной адрес

Нужен, если у регистратора или DNS-провайдера нет ALIAS для корня домена.

1. Разработчики ставят `canonical_host = "www.krunai.uz"` (переменная Terraform, `infra/terraform/variables.tf`). CloudFront Function начнёт перенаправлять на `www`.
2. Клиент не добавляет ALIAS на корень домена, а добавляет `www` CNAME. Корень домена перенаправляется на `https://www.krunai.uz` средствами DNS-провайдера (см. [dns-cloudns.md](dns-cloudns.md), раздел 5).

Текущий код всё ещё включает ALIAS в `dns_records` даже при `canonical_host = "www.krunai.uz"`. Эта строка в таблице клиенту не нужна; вопрос вынесен в отчёт тикета.

## 6. SES: песочница (sandbox)

Аккаунт SES создаётся в песочнице. В ней письма уходят только на проверенные адреса. Получатель заявок `gulmira@krunai.uz` попадает под проверенный домен `krunai.uz` (domain identity), поэтому отправка работает без отдельной проверки адреса. Письма на другие адреса в песочнице не уйдут. Запрос production access подаётся при необходимости, отдельно от выкатки.

## 7. Проверка после выкатки

1. Откройте сайт (`site_url`, после этапа 2 — `https://krunai.uz/en/` и `/ru/`) и отправьте тестовую заявку на EN и RU.
2. Письма приходят на `gulmira@krunai.uz` (Zoho) от `noreply@krunai.uz`, в «Входящие», не в «Спам».
3. В заголовках письма `Authentication-Results` есть `dkim=pass header.d=krunai.uz` и `dmarc=pass`.
4. `Reply-To` равен email посетителя из формы.

## Права и ограничения

- Все IAM-роли стека создаются с `permissions_boundary_arn`; их имена не начинаются с `ai-team-`.
- Пользователей IAM и ключей доступа стек не создаёт.
- State хранится в S3 с шифрованием и блокировкой через DynamoDB.
