# Деплой krunai.uz

Деплой идёт только из GitHub Actions (`.github/workflows/deploy.yml`) через OIDC-роль. Долгоживущих AWS-ключей нет.

## 1. Первичная настройка (один раз, локально)

Нужны: администратор AWS клиента, Terraform ≥ 1.6.

1. Создайте вне Terraform S3-бакет для state (versioning + шифрование) и DynamoDB-таблицу блокировок (ключ `LockID`, string). Значения по умолчанию: `krunai-terraform-state`, `krunai-terraform-locks`, регион `eu-west-3`.
2. Примените bootstrap (state локальный, не коммитится):
   ```
   cd infra/terraform/bootstrap
   terraform init
   terraform apply   # -var create_oidc_provider=false, если OIDC-провайдер GitHub в аккаунте уже есть
   terraform output deploy_role_arn
   ```
   Роль доверяет только `repo:emustapaev/test1:ref:refs/heads/main` и environment `production`.
3. В GitHub → Settings → Secrets and variables → Actions → **Variables** задайте:

   | Переменная | Значение |
   |---|---|
   | `AWS_DEPLOY_ROLE_ARN` | вывод `deploy_role_arn` |
   | `AWS_REGION` | `eu-west-3` |
   | `ENABLE_CUSTOM_DOMAIN` | `false` (этап 1) |
   | `CANONICAL_HOST` | `krunai.uz` или `www.krunai.uz` |
   | `ALARM_EMAIL` | адрес для алертов (SNS подтверждается письмом) |
   | `TF_STATE_BUCKET` | имя бакета state |
   | `TF_LOCK_TABLE` | имя таблицы блокировок |

## 2. Этап 1: деплой без своего домена

`ENABLE_CUSTOM_DOMAIN=false`. Запустите workflow **Deploy** (push в `main` или Run workflow). Пайплайн не ждёт валидацию ACM: сайт доступен на `*.cloudfront.net`.

В конце запуска DNS-таблица появляется в **Summary** запуска и в артефакте `dns-table` (`dns-table.md`).

## 3. Передача таблицы клиенту

Отправьте клиенту `dns-table.md` вместе с [docs/dns-cloudns.md](dns-cloudns.md). Сначала клиент добавляет CNAME для валидации ACM; существующие MX/TXT/DMARC не меняются.

## 4. Этап 2: после «готово» от клиента

Когда клиент добавил записи и сертификат ACM валидируется: поставьте `ENABLE_CUSTOM_DOMAIN=true` и перезапустите Deploy. Apply дождётся выдачи сертификата и привяжет `krunai.uz`/`www` к CloudFront. После этого клиент добавляет записи сайта (apex ALIAS, `www` CNAME).

## 5. Смена канонического хоста (fallback без ALIAS)

Если в ClouDNS нет ALIAS для apex: поставьте `CANONICAL_HOST=www.krunai.uz` и перезапустите Deploy. Сайт соберётся с `NEXT_PUBLIC_SITE_URL=https://www.krunai.uz`, locale-router будет редиректить на www, а в таблице исчезнет ALIAS и появится строка «Web redirect apex → www».

## Права роли

Политика в `infra/terraform/bootstrap/main.tf`: state-бакет и таблица блокировок, сервисы стека (S3, CloudFront, ACM, API Gateway, Lambda, DynamoDB, SES, SNS, CloudWatch, Logs) и управление IAM-ролями только с префиксом `krunai-*`.
