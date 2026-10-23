export const ALLOWED_LOCALES = ['en', 'ru'] as const;
export type Locale = (typeof ALLOWED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export type FieldErrorCode = 'required' | 'invalid_format' | 'too_short' | 'too_long' | 'invalid_value';
export type FieldErrors = Partial<Record<'name' | 'email' | 'message' | 'locale', FieldErrorCode>>;

export interface Lead {
  name: string;
  email: string;
  message: string;
  locale: Locale;
}

export type ValidationResult =
  | { ok: true; lead: Lead; honeypot: boolean }
  | { ok: false; fields: FieldErrors };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkText(
  value: unknown,
  min: number,
  max: number,
): { value: string } | { error: FieldErrorCode } {
  if (value === undefined || value === null) return { error: 'required' };
  if (typeof value !== 'string') return { error: 'invalid_format' };
  const v = value.trim();
  if (v.length === 0) return { error: 'required' };
  if (v.length < min) return { error: 'too_short' };
  if (v.length > max) return { error: 'too_long' };
  return { value: v };
}

export function validateLead(body: unknown): ValidationResult {
  const data = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<
    string,
    unknown
  >;

  // Honeypot: silent success, nothing else matters.
  if (typeof data.website === 'string' && data.website.trim() !== '') {
    return { ok: true, honeypot: true, lead: { name: '', email: '', message: '', locale: DEFAULT_LOCALE } };
  }

  const fields: FieldErrors = {};

  const name = checkText(data.name, 1, 100);
  if ('error' in name) fields.name = name.error;

  const email = checkText(data.email, 1, 254);
  if ('error' in email) fields.email = email.error === 'too_short' ? 'invalid_format' : email.error;
  else if (!EMAIL_RE.test(email.value)) fields.email = 'invalid_format';

  const message = checkText(data.message, 10, 2000);
  if ('error' in message) fields.message = message.error;

  let locale: Locale = DEFAULT_LOCALE;
  if (data.locale !== undefined && data.locale !== null) {
    if (typeof data.locale === 'string' && (ALLOWED_LOCALES as readonly string[]).includes(data.locale)) {
      locale = data.locale as Locale;
    } else {
      fields.locale = 'invalid_value';
    }
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    honeypot: false,
    lead: {
      name: (name as { value: string }).value,
      email: (email as { value: string }).value,
      message: (message as { value: string }).value,
      locale,
    },
  };
}
