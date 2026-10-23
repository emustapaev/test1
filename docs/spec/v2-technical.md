# krunai.uz: TZ v3. RU localization (delta to v1/v2)

Scope: add Russian as the second locale to the static landing. Everything from v1/v2 remains valid unless changed here: single-page site, AWS eu-west-3 (Paris), S3 + CloudFront, ACM certificate, lead form via serverless handler, SES to ernazar.mustapaev@gmail.com, IaC and CI/CD deploy.

## 1. Locales and routing
- Supported locales: `en` (default/fallback), `ru`.
- Routes: `/en/` and `/ru/`, both fully pre-rendered at build time (Next.js static export). No runtime server.
- The root `/` contains no content and redirects to the locale (see 2).
- Unknown paths go to the locale-specific 404 page (fallback `en`).
- `<html lang>` is set per locale.

## 2. Locale detection
Implemented at the edge with a CloudFront Function (viewer-request) on `/` only:
1. If cookie `lang` is `en` or `ru`, redirect 302 to `/{lang}/`.
2. Else parse `Accept-Language` (respecting q-values). If the highest-ranked supported language is `ru`, redirect to `/ru/`.
3. Otherwise redirect to `/en/`.
- Preserve the query string (UTM etc.) in the redirect.
- Respond with `Cache-Control: no-store` on the redirect, or vary the cache key on the `lang` cookie and `Accept-Language`, so a cached redirect is never served to the wrong user.
- Direct requests to `/en/...` or `/ru/...` are never redirected. Shared links always open in the requested language.
- Bots and crawlers follow the same rules. No cloaking.

Rationale: S3/CloudFront static hosting cannot do server-side negotiation, and a CloudFront Function is the cheapest edge option that adds no new runtime. Lambda@Edge is not needed.

## 3. Language switcher
- EN / RU toggle in the header, visible on desktop and mobile, keyboard-accessible, with the current locale marked (`aria-current`).
- On click: set cookie `lang=<locale>; Path=/; Max-Age=31536000; SameSite=Lax; Secure`, then navigate to the same section anchor in the other locale (e.g. `/en/#faq` → `/ru/#faq`). Section anchors are identical across locales.

## 4. Content and i18n
- All UI strings and content live in per-locale message files (e.g. `messages/en.json`, `messages/ru.json`) or per-locale content modules. No hardcoded strings in components.
- Build fails (CI check) if any key in `en` is missing in `ru` or vice versa.
- RU copy is a natural adaptation of the EN copy, not a literal machine translation. Product name "KRunAI" is not translated.
- Per-locale metadata: `<title>`, meta description, Open Graph/Twitter tags (`og:locale` = `en_US` / `ru_RU`, plus `og:locale:alternate`).
- SEO: `<link rel="alternate" hreflang="en">`, `hreflang="ru"`, `hreflang="x-default"` (→ `/en/`) on both pages. Canonical URL per locale. `sitemap.xml` lists both locale URLs with alternates.
- Typography: chosen fonts must include Cyrillic glyphs. Layout must survive longer RU strings (no overflow or clipping in buttons/nav at 320px width).

## 5. Lead form changes
- All labels, placeholders, validation errors, success/error messages are localized.
- Client sends a `locale` field (`en`|`ru`). The backend validates it against the allow-list (default `en`).
- Backend validation error messages are returned as error codes. The frontend maps them to localized text.
- Notification email to ernazar.mustapaev@gmail.com includes `Language: EN/RU` in the body and a `[RU]`/`[EN]` tag in the subject. Email body stays in English (internal notification).
- Anti-spam, rate limiting and the other v1 behaviour are unchanged.

## 6. Acceptance criteria
1. `GET /` with `Accept-Language: ru-RU,ru;q=0.9,en;q=0.8` and no cookie returns 302 to `/ru/`.
2. `GET /` with `Accept-Language: en-US` or `uz-UZ` or no header returns 302 to `/en/`.
3. `GET /` with cookie `lang=en` and `Accept-Language: ru` returns 302 to `/en/` (cookie wins).
4. `GET /ru/` and `GET /en/` return 200 with full content in the respective language. `<html lang>` matches.
5. Clicking the switcher on `/en/#faq` opens `/ru/#faq` and sets the `lang=ru` cookie. Reopening `/` then lands on `/ru/`.
6. Query string is preserved: `/?utm_source=x` → `/ru/?utm_source=x`.
7. CI fails when a translation key is missing in either locale.
8. Both pages contain correct hreflang (en, ru, x-default) and canonical tags. The sitemap includes both URLs.
9. Submitting the form on `/ru/` shows RU validation and success messages. The received email contains `Language: RU` and the subject tag `[RU]`.
10. No layout overflow on RU or EN at 320px, 768px and 1440px widths. Lighthouse performance/accessibility scores are not lower than the v1 targets for either locale.
11. E2E tests (Playwright) cover scenarios 1–3, 5 and 9.

## 7. Non-functional
- No new runtime infrastructure except the CloudFront Function (managed in IaC alongside the existing distribution).
- The CloudFront Function logs no personal data. Form logging rules from v1 are unchanged.
- Cache: static locale pages are cached as in v1. Redirect caching per section 2.

## 8. Out of scope
- Uzbek or any other locale (architecture must allow adding a locale by adding a message file and a route).
- CMS/admin for translations.
- Localized notification emails to the site owner.

## 9. Open questions
- None blocking. RU copy is prepared by the team. Client review of the RU texts is optional, before go-live.