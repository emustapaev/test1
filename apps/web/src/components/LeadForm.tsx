'use client';

import { useState, type FormEvent } from 'react';
import type { Locale } from '@/i18n/config';
import type { Messages } from '@/i18n/getMessages';
import { FIELD_NAMES, submitLead, validateLead, type FieldName } from '@/lib/leadApi';

type Status = 'idle' | 'sending' | 'success' | 'error';

const ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 16.5v.01" />
  </svg>
);

export function LeadForm({ locale, messages }: { locale: Locale; messages: Messages }) {
  const t = messages.form;
  const [status, setStatus] = useState<Status>('idle');
  const [codes, setCodes] = useState<Partial<Record<FieldName, string>>>({});
  const [errorText, setErrorText] = useState('');

  // Неизвестный код → общий текст; серверные тексты не используются.
  const errorMessage = (code: string): string => {
    const dict = t.errors as Record<string, string>;
    return Object.prototype.hasOwnProperty.call(dict, code) && code !== 'generic' ? dict[code] : t.errors.generic;
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'sending') return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const get = (k: string) => String(data.get(k) ?? '');
    const values = { name: get('name'), email: get('email'), message: get('message') };

    const local = validateLead(values);
    setErrorText('');
    if (Object.keys(local).length > 0) {
      setCodes(local);
      setStatus('idle');
      form.querySelector<HTMLElement>(`[name="${FIELD_NAMES.find((n) => local[n])}"]`)?.focus();
      return;
    }
    setCodes({});
    setStatus('sending');
    const result = await submitLead({
      name: values.name.trim(),
      email: values.email.trim(),
      message: values.message.trim(),
      lang: locale,
      website: get('website'),
    });
    if (result.ok) {
      setStatus('success');
      return;
    }
    if (Object.keys(result.fields).length > 0) {
      setCodes(result.fields);
      setStatus('idle');
      return;
    }
    setErrorText(result.code === 'rate_limited' ? t.errors.rate_limited : t.errors.generic);
    setStatus('error');
  }

  if (status === 'success') {
    return (
      <div className="form" data-testid="lead-success">
        <div className="banner ok" role="status">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12.5l3 3 5-6" />
          </svg>
          <div>
            <strong>{t.successTitle}</strong>
            {t.success}
          </div>
        </div>
      </div>
    );
  }

  const sending = status === 'sending';
  return (
    <form className="form" data-testid="lead-form" noValidate onSubmit={onSubmit} aria-busy={sending}>
      {FIELD_NAMES.map((name) => {
        const f = t.fields[name];
        const id = `lead-${name}`;
        const code = codes[name];
        const hintId = name === 'message' ? `${id}-hint` : undefined;
        const describedBy = [hintId, code ? `${id}-err` : undefined].filter(Boolean).join(' ') || undefined;
        const common = {
          id,
          name,
          placeholder: f.placeholder,
          required: true,
          disabled: sending,
          'aria-invalid': code ? true : undefined,
          'aria-describedby': describedBy,
        };
        return (
          <div className={code ? 'field invalid' : 'field'} key={name}>
            <label htmlFor={id}>{f.label}</label>
            {name === 'message' ? (
              <textarea {...common} rows={5} />
            ) : (
              <input {...common} type={name === 'email' ? 'email' : 'text'} autoComplete={name === 'email' ? 'email' : 'name'} />
            )}
            {name === 'message' && (
              <p className="hint" id={hintId}>
                {t.fields.message.hint}
              </p>
            )}
            {code && (
              <p className="error" id={`${id}-err`} role="alert">
                {ICON}
                <span>{errorMessage(code)}</span>
              </p>
            )}
          </div>
        );
      })}
      <div className="hp" aria-hidden="true">
        <label>
          {t.fields.website.label}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {status === 'error' && (
        <div className="banner bad" role="alert" data-testid="lead-error">
          {ICON}
          <div>
            <strong>{t.errorTitle}</strong>
            {errorText}
          </div>
        </div>
      )}
      <button className="btn btn-primary" type="submit" data-testid="lead-submit" disabled={sending} aria-busy={sending}>
        {sending && <span className="spinner" aria-hidden="true" />}
        {sending ? t.sending : status === 'error' ? t.retry : t.submit}
      </button>
    </form>
  );
}
