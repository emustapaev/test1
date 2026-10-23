# ADR 0004: Внешний DNS (ClouDNS), SES domain identity и двухэтапный деплой ACM

Статус: принято

## Context
ТЗ v3 (`docs/spec/v3-technical.md`, разделы 1–6): авторитативный DNS `krunai.uz` находится в ClouDNS, все DNS-изменения вносит клиент вручную. Почта домена работает в Zoho Mail, её записи MX, SPF (TXT на apex), DMARC (`_dmarc`) и DKIM Zoho менять нельзя. Заявки теперь уходят на `gulmira@krunai.uz` (ящик в Zoho), отправитель — `noreply@krunai.uz`. Terraform не может ждать DNS-валидации ACM, которую делает человек, поэтому полный `apply` за один проход невозможен. Часть вопросов ТЗ (раздел 6) открыта: ALIAS в тарифе ClouDNS, наличие DMARC, несколько получателей.

## Decision
- **DNS.** Route 53 hosted zone не создаётся, ресурсов Route 53 в IaC нет. Все DNS-значения выводятся outputs Terraform, из них формируется `docs/dns-cloudns.md` для клиента. Записи MX/SPF/DMARC/DKIM Zoho **не изменяются и не удаляются**; в таблицу попадают только добавляемые записи.
- **SES.** Domain identity `krunai.uz` в eu-west-3 с Easy DKIM (3 CNAME `<token>._domainkey` → `<token>.dkim.amazonses.com`; перед выдачей таблицы проверяется, что селекторы не пересекаются с селекторами Zoho). Custom MAIL FROM `mail.krunai.uz` (переменная `ses_mail_from_subdomain`): MX `mail` → `10 feedback-smtp.eu-west-3.amazonses.com`, TXT `mail` → `v=spf1 include:amazonses.com ~all`.
- **SPF и DMARC.** SPF на apex не трогаем (он принадлежит Zoho). Выравнивание DMARC обеспечивает DKIM-подпись SES с `d=krunai.uz`. Если DMARC у домена нет, в таблице предлагается необязательная запись `_dmarc` с `p=none`; если есть — не трогаем.
- **Sandbox.** Получатель на верифицированном домене, отдельная верификация адреса и выход из sandbox не требуются.
- **Получатель.** Адрес берётся из env Lambda `LEAD_RECIPIENT_EMAIL`, значение задаёт переменная Terraform `lead_recipient_email` (default `gulmira@krunai.uz`). Из запроса адрес не принимается. Отправитель — `LEAD_FROM_EMAIL` ← `lead_from_email` (default `noreply@krunai.uz`). IAM Lambda: `ses:SendEmail` только на identity `krunai.uz`.
- **Двухэтапный деплой.** Переменная `enable_custom_domain` (bool, default `false`).
  - Этап 1 (`false`): создаются S3, CloudFront на домене `*.cloudfront.net`, API, Lambda, SES identity и ACM-сертификат; outputs выдают `acm_validation_records`, `ses_dkim_records`, `ses_mail_from_records`, `dns_records`. Сертификат к CloudFront не привязан, aliases пусты.
  - Клиент добавляет записи в ClouDNS.
  - Этап 2 (`true`): `aws_acm_certificate_validation` дожидается валидации, сертификат и aliases подключаются к CloudFront.
- **Канонический хост.** Параметр `canonical_host` (`krunai.uz` | `www.krunai.uz`, default `krunai.uz`). Неканонический хост получает 301 на канонический (CloudFront Function). Если в тарифе ClouDNS нет ALIAS, ставится `canonical_host = "www.krunai.uz"`: `www` — CNAME на CloudFront, apex перенаправляется на www средствами ClouDNS (Web redirect) или A-записями на отдельный редирект-ресурс. Выбор фиксируется после проверки тарифа.
- **Мониторинг.** CloudWatch alarm на bounce и complaint rate SES и на ошибки Lambda; уведомления SNS → `alarm_email` (без default, задаётся явно).

### Terraform: переменные и outputs
Переменные: `domain_name` (`krunai.uz`), `canonical_host`, `enable_custom_domain`, `lead_recipient_email`, `lead_from_email`, `ses_mail_from_subdomain` (`mail`), `alarm_email`.
Outputs: `cloudfront_domain_name`, `acm_validation_records` (список `{name,type,value}`), `dns_records` (записи сайта), `ses_dkim_records`, `ses_mail_from_records`.

### Открытые вопросы ТЗ и влияние на реализацию
| Вопрос | Влияние | Значение по умолчанию |
|---|---|---|
| Есть ли ALIAS в тарифе ClouDNS | Определяет `canonical_host` и вид записи сайта (ALIAS на apex или CNAME на www + redirect) | `krunai.uz` (ALIAS); при отсутствии — `www.krunai.uz` без изменений кода |
| Есть ли DMARC и какая политика | Включать ли в `docs/dns-cloudns.md` опциональную `_dmarc` `p=none`; существующую не трогаем | запись опциональна, помечена в таблице |
| Несколько получателей | Сейчас один адрес. Расширение (список адресов) потребует изменения формата `LEAD_RECIPIENT_EMAIL` (через запятую) и кода `apps/api`; не реализуется | один адрес |

## Consequences
+ Существующая почта в Zoho не затрагивается: SES использует только новые имена (`*._domainkey` с токенами SES, `mail`).
+ Деплой не блокируется ожиданием клиента; повторный `apply` с `enable_custom_domain = true` детерминирован.
+ Получатель меняется конфигурацией без правки кода.
− DNS вручную: риск ошибок и задержек. Смягчение: таблица в `docs/dns-cloudns.md`, проверка `dig` до и после.
− MAIL FROM-запись SPF на `mail.krunai.uz` не даёт SPF-выравнивания с From `krunai.uz` (организационный домен совпадает, но DMARC опирается на DKIM); при сбое DKIM письмо не пройдёт DMARC.
− Fallback на `www` меняет канонический URL: нужно синхронизировать `NEXT_PUBLIC_SITE_URL`, canonical/hreflang и sitemap.
− Пока `enable_custom_domain = false`, сайт доступен только по `*.cloudfront.net`.

## Alternatives
- **Route 53 с делегированием NS из ClouDNS** — отвергнуто: требует смены NS и переноса записей Zoho, риск для почты (ТЗ §1).
- **Верификация одного email-адреса вместо domain identity** — отвергнуто: нет DKIM с `d=krunai.uz`, DMARC не пройдёт, нужен sandbox-режим.
- **Изменение SPF на apex (`include:amazonses.com`)** — отвергнуто: apex SPF принадлежит Zoho и не меняется.
- **Один apply с ожиданием валидации ACM** — отвергнуто: бесконечное ожидание ручного действия клиента.
- **Получатель из тела запроса** — отвергнуто по безопасности (открытый релей).
