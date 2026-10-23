import type { Locale } from '@/i18n/config';

export const LEAD_API_PATH = process.env.NEXT_PUBLIC_LEAD_API_PATH || '/api/lead';

export const FIELD_NAMES = ['name', 'email', 'message'] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

/** Коды ошибок полей из contracts/openapi.yaml. */
export type FieldErrorCode = 'required' | 'invalid_format' | 'too_short' | 'too_long' | 'invalid_value';

export type LeadPayload = {
  name: string;
  email: string;
  message: string;
  locale: Locale;
  website: string;
};

export type LeadResult =
  | { ok: true }
  | { ok: false; code: string; fields: Partial<Record<FieldName, string>> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Клиентская проверка (правила v1); возвращает коды, а не тексты. */
export function validateLead(v: Pick<LeadPayload, FieldName>): Partial<Record<FieldName, FieldErrorCode>> {
  const errors: Partial<Record<FieldName, FieldErrorCode>> = {};
  const name = v.name.trim();
  const email = v.email.trim();
  const message = v.message.trim();
  if (!name) errors.name = 'required';
  else if (name.length > 100) errors.name = 'too_long';
  if (!email) errors.email = 'required';
  else if (!EMAIL_RE.test(email)) errors.email = 'invalid_format';
  if (!message) errors.message = 'required';
  else if (message.length < 10) errors.message = 'too_short';
  else if (message.length > 2000) errors.message = 'too_long';
  return errors;
}

export async function submitLead(payload: LeadPayload): Promise<LeadResult> {
  let res: Response;
  try {
    res = await fetch(LEAD_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, code: 'internal_error', fields: {} };
  }
  let data: { error?: unknown; fields?: unknown } | null = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.ok) return { ok: true };
  const code = typeof data?.error === 'string' ? data.error : 'internal_error';
  const fields: Partial<Record<FieldName, string>> = {};
  if (data?.fields && typeof data.fields === 'object') {
    for (const n of FIELD_NAMES) {
      const c = (data.fields as Record<string, unknown>)[n];
      if (typeof c === 'string') fields[n] = c;
    }
  }
  return { ok: false, code, fields };
}
