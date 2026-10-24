import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, locales } from '@/i18n/config';
import { detectLocale } from '@/i18n/detectLocale';

export function middleware(req: NextRequest) {
  // Health-check ALB: GET / без редиректа.
  if (req.headers.get('user-agent')?.startsWith('ELB-HealthChecker')) {
    return new NextResponse('ok', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const lang = detectLocale(
    { cookie: req.cookies.get('lang')?.value, acceptLanguage: req.headers.get('accept-language') },
    locales,
    defaultLocale,
  );
  // nextUrl в standalone-сервере отдаёт localhost:PORT, поэтому origin берём из Host/X-Forwarded-Proto (ALB).
  const host = req.headers.get('host') ?? req.nextUrl.host;
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || req.nextUrl.protocol.replace(':', '');
  const res = NextResponse.redirect(new URL(`/${lang}/${req.nextUrl.search}`, `${proto}://${host}`), 302);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

// Только корень; /api/* и прочие пути не затрагиваются.
export const config = { matcher: ['/'] };
