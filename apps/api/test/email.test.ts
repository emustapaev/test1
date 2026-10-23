import { describe, it, expect } from 'vitest';
import { buildSubject, buildBody } from '../src/email';

const lead = (locale: 'en' | 'ru') => ({ name: 'Ivan', email: 'i@x.com', message: 'Hello there, project!', locale });

describe('email', () => {
  it('ru: [RU] subject and Language: RU body', () => {
    expect(buildSubject(lead('ru'))).toBe('[RU] New lead from krunai.uz: Ivan');
    expect(buildBody(lead('ru'))).toContain('Language: RU');
  });
  it('en: [EN] subject and Language: EN body', () => {
    expect(buildSubject(lead('en'))).toBe('[EN] New lead from krunai.uz: Ivan');
    expect(buildBody(lead('en'))).toContain('Language: EN');
  });
  it('strips all control characters and line separators from the subject', () => {
    expect(buildSubject({ ...lead('en'), name: 'a\u0000b\u000bc\u0085d\u2028e\tf' })).toBe(
      '[EN] New lead from krunai.uz: a b c d e f',
    );
  });
  it('strips newlines from the subject', () => {
    expect(buildSubject({ ...lead('en'), name: 'a\r\nBcc: x' })).not.toMatch(/[\r\n]/);
  });
});
