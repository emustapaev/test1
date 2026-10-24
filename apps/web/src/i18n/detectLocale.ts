// Выбор локали для «/»: cookie lang → Accept-Language (с учётом q) → defaultLocale.
// Только стираемый TS-синтаксис и без импортов значений: файл запускается и в node --test.
export function pickFromCookie<L extends string>(
  value: string | undefined | null,
  supported: readonly L[],
): L | null {
  return supported.find((l) => l === value) ?? null;
}

// Поддерживаемая локаль с наивысшим q (при равенстве — первая в заголовке) или null.
export function pickFromAcceptLanguage<L extends string>(
  header: string | undefined | null,
  supported: readonly L[],
): L | null {
  if (!header) return null;
  let best: L | null = null;
  let bestQ = 0;
  for (const part of header.split(',')) {
    const [rawTag, ...params] = part.split(';');
    const tag = rawTag.trim().toLowerCase();
    if (!tag) continue;
    let q = 1;
    for (const p of params) {
      const s = p.trim();
      if (s.slice(0, 2).toLowerCase() === 'q=') {
        q = parseFloat(s.slice(2));
        if (Number.isNaN(q)) q = 0;
      }
    }
    const lang = tag.split('-')[0];
    const match = supported.find((l) => l === lang);
    if (match && q > bestQ) {
      best = match;
      bestQ = q;
    }
  }
  return best;
}

export function detectLocale<L extends string>(
  input: { cookie?: string | null; acceptLanguage?: string | null },
  supported: readonly L[],
  fallback: L,
): L {
  return (
    pickFromCookie(input.cookie, supported) ??
    pickFromAcceptLanguage(input.acceptLanguage, supported) ??
    fallback
  );
}
