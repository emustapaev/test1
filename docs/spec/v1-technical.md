# krunai.uz — технические требования (v1)

## 1. Обзор
Статический одностраничный промо-лендинг платформы KRunAI на английском языке. Для формы заявки нужен один серверлесс-эндпоинт, который отправляет письмо. Развёртывание в AWS-аккаунте клиента, основной регион **eu-west-3 (Paris)**.

## 2. Архитектура и стек
| Слой | Решение |
|---|---|
| Фронтенд | Next.js (App Router) + TypeScript + Tailwind CSS, `output: 'export'` (полностью статическая сборка) |
| Хостинг | S3 (приватный bucket, eu-west-3) + CloudFront с Origin Access Control |
| TLS | ACM-сертификат для `krunai.uz` и `www.krunai.uz` в **us-east-1** (требование CloudFront) |
| DNS | Route 53 hosted zone `krunai.uz`, NS делегируются у регистратора .uz |
| Форма | API Gateway HTTP API → AWS Lambda (Python 3.12) → Amazon SES (eu-west-3) |
| IaC | Terraform (state в S3 + DynamoDB lock, eu-west-3) |
| CI/CD | GitHub Actions (репозиторий emustapaev/test1), доступ в AWS через OIDC без долгоживущих ключей |
| Логи/мониторинг | CloudWatch Logs (Lambda, API GW access logs), CloudFront standard logs в S3 |

**Отступления от golden path:**
- Не используются ECS Fargate, FastAPI и PostgreSQL. Сайт статический, а у формы одно действие (отправить письмо). Для такой задачи S3 + CloudFront + Lambda дешевле, проще в поддержке, лучше масштабируется и почти ничего не стоит в простое. Python в Lambda оставлен из golden path.
- База данных не нужна, потому что заявки по требованию только отправляются на почту.

## 3. Функциональные требования

### FR-1. Секции лендинга
Страница `/` содержит секции с якорями: `#hero`, `#how-it-works` (Create / Test / Deploy / Maintain), `#process`, `#benefits`, `#use-cases`, `#faq`, `#contact`, а также footer. Хедер закреплён (sticky), в нём навигация по якорям и CTA «Get started».
- AC: все секции присутствуют, клики по пунктам навигации плавно прокручивают к соответствующей секции.
- AC: CTA в hero и хедере ведёт к `#contact`.
- AC: FAQ сделан как аккордеон (раскрытие и закрытие, доступно с клавиатуры), 5–7 вопросов.

### FR-2. Контент и бренд
Команда готовит англоязычные тексты, SVG-логотип «KRunAI», палитру (тёмная технологичная тема с акцентным цветом), favicon и OG-изображение.
- AC: на сайте нет текста-заглушки (lorem ipsum), все тексты на английском.
- AC: заданы `<title>`, meta description, Open Graph и Twitter-card теги, favicon, `robots.txt`, `sitemap.xml`.

### FR-3. Адаптивность
- AC: корректное отображение на ширине 360, 768, 1280 и 1920 px без горизонтального скролла.

### FR-4. Форма заявки
Поля: `name` (обязательно, 1–100 символов), `email` (обязательно, валидный формат), `message` (обязательно, 10–2000 символов), скрытое honeypot-поле.
- AC: клиентская валидация с понятными сообщениями об ошибках.
- AC: при успехе форма заменяется на сообщение «Thank you! We'll get back to you soon.», при ошибке показывается сообщение и можно отправить повторно.
- AC: кнопка блокируется на время отправки (защита от двойного сабмита).

### FR-5. Эндпоинт отправки
`POST /contact` (API Gateway HTTP API, кастомный домен не обязателен, допускается проксирование через CloudFront по пути `/api/*`).
- Lambda повторно валидирует данные на сервере. Если заполнено honeypot-поле, возвращает 200 и ничего не отправляет.
- Отправляет письмо через SES на `LEAD_RECIPIENT_EMAIL`. Отправитель: `no-reply@krunai.uz` (SES-верифицированный домен с DKIM). `Reply-To` равен email посетителя. Тема: `New lead from krunai.uz: {name}`.
- AC: валидный запрос → 200 и письмо доставлено; невалидный → 400 с описанием ошибки полей; сбой SES → 502, ошибка залогирована.
- AC: CORS разрешён только для `https://krunai.uz` и `https://www.krunai.uz`.
- AC: throttling API Gateway (например, burst 10, rate 5 rps). Lambda reserved concurrency ≤ 5.

### FR-6. Домен и HTTPS
- AC: `https://krunai.uz` открывает сайт, `https://www.krunai.uz` делает 301-редирект на apex, HTTP редиректится на HTTPS.
- AC: сертификат валиден (DNS-валидация через Route 53).

## 4. Модель данных
Персистентного хранилища нет. Payload заявки:
```json
{ "name": "string", "email": "string", "message": "string", "website": "string (honeypot, must be empty)" }
```

## 5. Роли и права
- Посетитель: анонимный, только чтение страницы и отправка формы.
- Администратора на сайте нет. Контент меняется через репозиторий и CI/CD.
- IAM: роль Lambda с правами только `ses:SendEmail` на верифицированную identity и запись в свои логи. Роль GitHub OIDC с минимальными правами на деплой (S3 sync, CloudFront invalidation, Terraform-ресурсы проекта).

## 6. Нефункциональные требования
- **Производительность:** Lighthouse (mobile) ≥ 90 по Performance, Accessibility, Best Practices, SEO. Изображения оптимизированы (WebP/AVIF), кэширование: HTML `no-cache`, ассеты с хэшем `max-age=31536000, immutable`.
- **Безопасность:** S3 недоступен публично (только через OAC). CloudFront Response Headers Policy: HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, базовый CSP. TLS 1.2+. Секретов в репозитории нет.
- **Логирование:** Lambda пишет структурированные JSON-логи (без полного текста сообщения, email маскируется). Retention 30 дней. CloudWatch alarm на ошибки Lambda > 0 за 5 мин (SNS → email клиента).
- **Доступность:** семантическая разметка, alt у изображений, контраст WCAG AA, работа с клавиатуры.
- **Стоимость:** только serverless и managed-сервисы, без постоянно работающих вычислений.

## 7. Интеграции
- Amazon SES (eu-west-3): верификация домена `krunai.uz` (DKIM, SPF, DMARC-записи в Route 53). В sandbox-режиме достаточно верифицировать адрес получателя. Выход из sandbox опционален.
- Регистратор домена .uz: смена NS на Route 53 (делает клиент или оператор с его доступом).

## 8. Деплой
- `terraform apply` создаёт всю инфраструктуру. Pipeline GitHub Actions на push в `main`: lint → typecheck → build → (Lambda unit-тесты pytest) → S3 sync → CloudFront invalidation.
- AC: повторный деплой идемпотентен, README описывает развёртывание с нуля.

## 9. Тестирование
- Unit-тесты Lambda: валидация, honeypot, обработка ошибок SES (мок).
- E2E (Playwright) по статике: навигация по якорям, FAQ, валидация формы, успешная отправка (с моком API).

## 10. Вне скоупа
CMS/админка, мультиязычность, аналитика (если клиент не попросит), блог, авторизация, оплата, хранение лидов в БД.

## 11. Открытые вопросы
1. Email получателя заявок (`LEAD_RECIPIENT_EMAIL`): ожидается от клиента.
2. Делегирование NS krunai.uz в Route 53 у регистратора: кто выполняет (клиент или оператор)?
3. Нужна ли веб-аналитика (например, Plausible или GA4) и баннер cookies?
4. Нужны ли ссылки на соцсети или Telegram в футере?
5. Нужна ли капча (например, Cloudflare Turnstile / hCaptcha), если honeypot и throttling окажется недостаточно?