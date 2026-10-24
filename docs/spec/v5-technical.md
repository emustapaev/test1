# krunai.uz — согласованная архитектура (базовый вариант)

Дельта к ТЗ v1–v4. Всё, что здесь не упомянуто, остаётся в силе. При расхождениях действует этот документ.

## 1. Архитектура (зафиксирована)
- Регион: eu-west-3 (Paris). ACM-сертификат для CloudFront: us-east-1.
- Frontend: Next.js + TypeScript + Tailwind, `output: 'export'`, i18n EN/RU (как в v2).
- Хостинг: S3 (private, Block Public Access, OAC) + CloudFront (HTTPS only, redirect HTTP->HTTPS, сжатие, кэширование ассетов).
- CloudFront Function (viewer-request): 301 с www.krunai.uz на https://krunai.uz с сохранением пути и query.
- Форма: API Gateway HTTP API (POST /contact) -> Lambda (Python 3.12) -> SES v2 (eu-west-3).
  - From: noreply@krunai.uz, To: gulmira@krunai.uz, Reply-To: email посетителя.
  - SES domain identity krunai.uz с Easy DKIM (3 CNAME), custom MAIL FROM mail.krunai.uz (MX + TXT SPF на поддомене). Корневые MX/SPF/DMARC (Zoho) не трогать.
- Антиспам: honeypot-поле и throttling на stage API Gateway (rate/burst задаются в IaC, например 5 rps / burst 10).
- Хранилище заявок отсутствует: никаких DynamoDB/S3 для payload.
- Observability: CloudWatch Logs (retention 14–30 дней), alarms: Lambda Errors > 0, Lambda Throttles, SES Bounce/Complaint rate, 5xx API Gateway.
- IaC + CI/CD по стандарту платформы. Деплой только после подтверждения клиентом («Выкатить» / /deploy).
- Не входит: DynamoDB, WAF, ALB, Fargate, NAT, RDS.

## 2. Функциональные требования и критерии приёмки
1. Статический сайт отдаётся через CloudFront.
   - AC: прямой доступ к S3-объектам возвращает 403; https://krunai.uz/ и /ru/ (или принятая i18n-схема) отвечают 200.
2. Редирект www.
   - AC: `curl -I https://www.krunai.uz/foo?x=1` даёт 301 с Location `https://krunai.uz/foo?x=1`.
3. Отправка формы.
   - AC: валидный POST создаёт письмо на gulmira@krunai.uz с From noreply@krunai.uz и Reply-To равным email посетителя. В письме указаны имя, email, сообщение, язык (EN/RU), время в UTC.
   - AC: невалидные данные (пустое имя, некорректный email, сообщение длиннее 5000 символов) дают 400 с кодом ошибки; фронт показывает локализованное сообщение.
   - AC: при заполненном honeypot ответ 200, письмо не отправляется, в лог пишется событие `honeypot_triggered` без PII.
   - AC: при превышении лимита ответ 429, фронт показывает локализованное сообщение «попробуйте позже».
4. Безопасность заголовков письма.
   - AC: CR/LF в имени и email отклоняются (защита от header injection).
5. Алармы.
   - AC: искусственная ошибка Lambda переводит alarm в состояние ALARM (проверяется на стенде или в тесте IaC).

## 3. Модель данных
Не хранится. Payload запроса: `{ name: string(1..100), email: string(email, <=254), message: string(1..5000), lang: "en"|"ru", website: string (honeypot, должен быть пустым) }`.

## 4. Роли и права
- Посетитель: просмотр сайта, отправка формы.
- Lambda IAM: только `ses:SendEmail` для identity krunai.uz и запись в свои логи (least privilege).
- Админки нет.

## 5. Нефункциональные требования
- PII (имя, email, текст) не логируется; в логах только request id, статус, язык, признаки антиспама.
- CORS на API: только https://krunai.uz (и localhost для dev).
- Lighthouse (mobile) для Performance, Accessibility, SEO не ниже 90.
- Стоимость: в пределах free tier при ожидаемых объёмах (до ~10 ГБ трафика и до ~1000 заявок в месяц).

## 6. DNS (ClouDNS)
После первой выкатки бот присылает таблицу: ACM validation CNAME, ALIAS krunai.uz -> CloudFront (fallback: www основной, если ALIAS недоступен, как в v3), CNAME www -> CloudFront, 3 DKIM CNAME, MX и TXT для mail.krunai.uz. Бот сам проверяет наличие записей. Существующие записи Zoho не изменяются.

## 7. Открытые вопросы
- Юридический: требования Узбекистана к локализации персональных данных граждан. Данные проходят через eu-west-3 транзитом и хранятся в Zoho Mail. Клиенту рекомендовано проконсультироваться с юристом.
- SES sandbox: до выхода из sandbox получатель gulmira@krunai.uz проверяется через domain identity. Запрос production access подаётся при необходимости.

## Согласованное решение (обязательно, одобрено клиентом)

- Вариант: Базовый: сайт + форма на почту
- Регион AWS: `eu-west-3` (переменная `AWS_REGION`)
- Архитектура: Next.js + TypeScript + Tailwind, статический экспорт (EN/RU, i18n). S3 (private, OAC) + CloudFront, ACM-сертификат в us-east-1 для CloudFront, CloudFront Function для редиректа www -> apex. Форма: API Gateway HTTP API + Lambda (Python) -> SES (eu-west-3), отправитель noreply@krunai.uz, Reply-To — посетитель, custom MAIL FROM mail.krunai.uz, DKIM CNAME в ClouDNS. Антиспам: honeypot + throttling на API Gateway. CloudWatch logs + alarms на ошибки Lambda/SES. IaC + CI/CD по стандарту платформы.
- Бюджет AWS: ≈$0 (в бесплатном уровне)/мес; не добавлять постоянно работающие платные ресурсы сверх перечисленных без нового согласования.
- Данные: Через форму приходят персональные данные: имя, email и текст сообщения. В базовом варианте они нигде не хранятся, только пересылаются письмом на gulmira@krunai.uz. В расширенном варианте их копия хранится в базе в AWS (Париж). Риск: закон Узбекистана о персональных данных требует хранить данные граждан Узбекистана на серверах внутри страны. Домен .uz, поэтому стоит уточнить у юриста, касается ли это вашей формы, особенно если хранить копию заявок.

| Компонент | $/мес |
|---|---|
| Хранилище файлов S3 | ≈$0 (в бесплатном уровне) |
| CDN CloudFront (раздача сайта) | ≈$0 (в бесплатном уровне) |
| SSL-сертификат ACM | ≈$0 (в бесплатном уровне) |
| API Gateway (HTTP API) | ≈$0 (в бесплатном уровне) |
| Функции AWS Lambda | ≈$0 (в бесплатном уровне) |
| Отправка писем SES | ≈$0 (в бесплатном уровне) |
| Логи CloudWatch | ≈$0 (в бесплатном уровне) |
| Алерты CloudWatch ×2 | ≈$0 (в бесплатном уровне) |
| **Итого** | **≈$0 (в бесплатном уровне)** |
