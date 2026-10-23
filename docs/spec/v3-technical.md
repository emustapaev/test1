# krunai.uz: DNS во внешнем провайдере (ClouDNS), сосуществование с Zoho Mail, смена получателя заявок

Дельта к v1 и v2. Всё, что не упомянуто, остаётся как в v1 и v2: статический лендинг EN/RU, S3 + CloudFront, ACM, обработчик формы (API Gateway + Lambda) + SES, регион eu-west-3. ACM-сертификат для CloudFront выпускается в us-east-1.

## 1. Ограничения

- Авторитативный DNS для krunai.uz находится в **ClouDNS**. Route 53 hosted zone для krunai.uz **не создаётся**. Все DNS-изменения вносит клиент вручную.
- Почта домена работает в **Zoho Mail**. Существующие записи MX, SPF (TXT на apex), DMARC (_dmarc), а также DKIM Zoho (TXT/CNAME с селектором Zoho) **не изменяются и не удаляются**.

## 2. Функциональные требования

### FR-1. Получатель заявок
- Получатель уведомлений формы: `gulmira@krunai.uz`. Значение задаётся конфигурацией (env/SSM Parameter), а не хардкодом. Адрес ernazar.mustapaev@gmail.com из конфигурации удаляется.
- From: `noreply@krunai.uz`, Reply-To: email посетителя (после валидации).
- **Критерии приёмки:** тестовая заявка с формы (EN и RU) доставляется во входящие gulmira@krunai.uz в Zoho и не попадает в спам; Reply-To равен email посетителя; в письме указан язык заявки.

### FR-2. SES: доменная идентичность без влияния на Zoho
- Создать SES domain identity `krunai.uz` в eu-west-3 с Easy DKIM (3 CNAME `*._domainkey.krunai.uz` → `*.dkim.amazonses.com`). Перед выдачей таблицы проверить, что селекторы SES не совпадают с селекторами Zoho DKIM.
- Настроить **custom MAIL FROM**: `mail.krunai.uz`, с записями MX `mail.krunai.uz` → `feedback-smtp.eu-west-3.amazonses.com` (priority 10) и TXT `mail.krunai.uz` → `v=spf1 include:amazonses.com ~all`. SPF на apex не меняется, поэтому SPF-выравнивание для DMARC обеспечивается через DKIM-подпись SES (d=krunai.uz).
- Если у домена нет записи DMARC, предложить клиенту необязательную запись `_dmarc` с `p=none` и пометить её в таблице как опциональную. Если DMARC уже есть, не трогать.
- Получатель на верифицированном домене, поэтому отдельная верификация email-адреса не требуется даже в SES sandbox. Запрос выхода из sandbox не обязателен для этого сценария.
- **Критерии приёмки:** в SES статус identity = Verified, DKIM = Successful, MAIL FROM = Success; в заголовках полученного письма `dkim=pass` (header.d=krunai.uz) и `dmarc=pass`; MX, SPF и DMARC apex до и после совпадают (сравнение вывода `dig`).

### FR-3. ACM и привязка домена
- ACM-сертификат (us-east-1) для `krunai.uz` и `www.krunai.uz`, DNS validation: CNAME-записи передаются клиенту.
- Записи сайта: `krunai.uz` ALIAS → `<distribution>.cloudfront.net`; `www.krunai.uz` CNAME → `<distribution>.cloudfront.net`. Редирект www → apex (301) делает CloudFront Function.
- Fallback, если ALIAS недоступен в тарифе ClouDNS: каноническим становится `www.krunai.uz`, а apex перенаправляется на www средствами ClouDNS (Web redirect) или через A-записи на отдельный редирект-ресурс. Выбор фиксируется после проверки тарифа.
- **Критерии приёмки:** `https://krunai.uz` и `https://www.krunai.uz` отвечают с валидным сертификатом; неканонический хост отдаёт 301 на канонический; http → https редирект работает.

### FR-4. Таблица DNS-записей для клиента
- Перед формированием таблицы снять текущие публичные записи домена (`dig` NS, MX, TXT, _dmarc, CNAME/TXT DKIM Zoho) и приложить к таблице как «текущее состояние, не менять».
- Таблица содержит только **добавляемые** записи с колонками: назначение, тип, имя (host в формате ClouDNS, относительное), значение, TTL, обязательность.
- Таблица на русском, с короткой пошаговой инструкцией для ClouDNS. Хранится в репозитории (`docs/dns-cloudns.md`) и передаётся клиенту.
- **Критерии приёмки:** таблица включает записи ACM, сайта, SES DKIM и MAIL FROM; в ней нет записей, изменяющих или удаляющих MX, SPF и DMARC apex; после применения все проверки FR-2 и FR-3 проходят.

## 3. Модель данных
Без изменений. Изменяется только параметр конфигурации `LEAD_RECIPIENT_EMAIL = gulmira@krunai.uz`.

## 4. Инфраструктура (IaC)
- Из IaC удалить или не создавать ресурсы Route 53 для krunai.uz.
- DNS-значения (ACM validation, CloudFront domain, DKIM tokens, MAIL FROM) выводить как outputs для генерации таблицы.
- Деплой не должен ждать валидации ACM бесконечно: предусмотреть двухэтапный запуск (создание ресурсов, затем подключение сертификата к CloudFront после подтверждения клиентом).

## 5. Нефункциональные требования
- Безопасность: IAM-права Lambda на отправку ограничены `ses:SendEmail` для identity krunai.uz; адрес получателя не принимается из запроса.
- Логирование: результат отправки (message id или ошибка) логируется в CloudWatch без тела сообщения и персональных данных, кроме домена email.
- Мониторинг: алерт на bounce/complaint rate SES (CloudWatch alarm) и на ошибки Lambda.

## 6. Открытые вопросы
- Поддерживает ли тариф ClouDNS клиента записи ALIAS (определяет FR-3 fallback).
- Есть ли у домена DMARC-запись и с какой политикой (проверяется командой по публичному DNS).
- Нужна ли в будущем отправка заявок на несколько адресов (сейчас один: gulmira@krunai.uz).
