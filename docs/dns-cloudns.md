# DNS krunai.uz: что добавить в ClouDNS

Документ для владельца домена. Нужно **добавить** несколько новых записей. Существующие записи (почта Zoho) **менять и удалять нельзя**.

> Таблица ниже получена из Terraform (`scripts/dns/render-table.mjs`). Значения в угловых скобках — шаблон, реальные значения выдаёт команда из раздела «Как получить таблицу».

## 1. Текущее состояние (не менять)

Снимок публичного DNS: `docs/dns/baseline.txt` (обновление: `bash scripts/dns/snapshot.sh krunai.uz`).

| Что | Текущее значение (на 2026-10-23) |
|---|---|
| NS | `hal.ns.cloudflare.com.`, `naomi.ns.cloudflare.com.` |
| MX | `10 mx.zoho.com.`, `20 mx2.zoho.com.`, `50 mx3.zoho.com.` |
| TXT apex (SPF и проверка Zoho) | `v=spf1 include:zohomail.com ~all`, `zoho-verification=zb69418690.zmverify.zoho.com` |
| DMARC (`_dmarc`) | записи нет |
| DKIM Zoho (селекторы `zmail`, `zoho`, `zmail2`, `zmail3`, `default`) | публично не найдены |

**Важно:** по публичному DNS серверы имён домена сейчас — Cloudflare, а не ClouDNS. Записи нужно вносить в той панели, чьи серверы имён указаны у регистратора. Если это Cloudflare, названия полей в инструкции ниже совпадают по смыслу. Уточните у клиента, где реально управляется зона.

Не менять: MX, TXT на основном домене (SPF), `_dmarc` (если появится), DKIM Zoho.

## 2. Таблица добавляемых записей

Имя (host) — относительное: без `.krunai.uz` и без точки на конце. «(пусто)» — основной домен (apex). TTL везде 3600.

| Назначение | Тип | Имя (host) | Значение | TTL | Обязательность |
|---|---|---|---|---|---|
| Подтверждение сертификата HTTPS (ACM) | CNAME | `<_acm-token>` | `<_acm-value>.acm-validations.aws.` | 3600 | Обязательно, сначала |
| Подтверждение сертификата HTTPS (ACM), www | CNAME | `<_acm-token>.www` | `<_acm-value>.acm-validations.aws.` | 3600 | Обязательно, сначала |
| Сайт, основной адрес (apex) | ALIAS | *(пусто)* | `<id>.cloudfront.net` | 3600 | Обязательно, на этапе 2 |
| Сайт, адрес с www | CNAME | `www` | `<id>.cloudfront.net` | 3600 | Обязательно, на этапе 2 |
| Подпись писем DKIM (Amazon SES) ×3 | CNAME | `<token>._domainkey` | `<token>.dkim.amazonses.com` | 3600 | Обязательно |
| Служебный адрес отправки SES (MAIL FROM), MX | MX | `mail` | `10 feedback-smtp.eu-west-3.amazonses.com` | 3600 | Обязательно |
| Служебный адрес отправки SES (MAIL FROM), SPF | TXT | `mail` | `v=spf1 include:amazonses.com ~all` | 3600 | Обязательно |
| Политика DMARC (только мониторинг) | TXT | `_dmarc` | `v=DMARC1; p=none` | 3600 | Опционально (только если DMARC нет) |

Записи MX и TXT выше — на поддомене `mail`, а не на основном домене: почту Zoho они не затрагивают.

### Как получить таблицу с реальными значениями

```bash
cd infra/terraform
terraform output -json > /tmp/outputs.json
cd ../..
node scripts/dns/render-table.mjs /tmp/outputs.json --baseline docs/dns/baseline.txt
# если в тарифе нет ALIAS:
node scripts/dns/render-table.mjs /tmp/outputs.json --baseline docs/dns/baseline.txt --canonical www
```

Скрипт завершится с ошибкой, если селектор DKIM Amazon SES совпадёт с селектором Zoho или если в записях окажутся MX/TXT на основном домене либо `_dmarc`.

## 3. Пошаговая инструкция для ClouDNS

1. Войдите в ClouDNS → **DNS Hosting** → зона `krunai.uz`.
2. Нажмите **Add new record**.
3. Выберите **Type** (CNAME, MX, TXT или ALIAS) из строки таблицы.
4. В поле **Host** вставьте значение из колонки «Имя (host)». Для пустого имени оставьте поле пустым. Не дописывайте `.krunai.uz`.
5. В поле **Points to / Value** вставьте значение из колонки «Значение» целиком. Для MX: приоритет `10`, сервер `feedback-smtp.eu-west-3.amazonses.com`.
6. **TTL** — 3600. Сохраните.
7. Повторите для каждой строки. Существующие записи не открывайте и не редактируйте.
8. Сверьте результат: `bash scripts/dns/snapshot.sh krunai.uz` — NS, MX, SPF и DKIM Zoho должны остаться такими же, как в разделе 1.

## 4. Порядок работ

1. **Сначала** добавьте CNAME подтверждения сертификата (ACM), затем DKIM и MAIL FROM. Ждите 5–30 минут, пока записи распространятся.
2. Сообщите разработчикам: запускается этап 2 (`enable_custom_domain=true`), он дожидается подтверждения сертификата и подключает домен к сайту.
3. **После** этапа 2 добавьте записи сайта (ALIAS на основной домен и CNAME `www`). Раньше добавлять нельзя: сайт ещё не отвечает на этом адресе.

## 5. Если в тарифе ClouDNS нет ALIAS

Основным адресом становится `www.krunai.uz` (Terraform: `canonical_host = "www.krunai.uz"`).

1. Таблицу получите с ключом `--canonical www`: записи ALIAS в ней не будет.
2. Добавьте CNAME `www` → `<id>.cloudfront.net`.
3. Для основного адреса в ClouDNS откройте **Web Redirects** → **Add new**, host пустой, назначение `https://www.krunai.uz`, постоянный (301). Это настройка редиректа, а не DNS-запись.
4. Для редиректа с HTTPS на основном домене может понадобиться отдельный сертификат у ClouDNS — уточните в их поддержке.

## 6. Проверка

После внесения записей: `dig +short CNAME <имя>.krunai.uz` должен вернуть значение из таблицы. Полные проверки после применения выполняются отдельно.
