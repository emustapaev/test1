import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../src/handler';

const ses = mockClient(SESv2Client);
const ddb = mockClient(DynamoDBClient);

const ev = (body: unknown, raw = false): APIGatewayProxyEventV2 =>
  ({
    body: raw ? (body as string) : JSON.stringify(body),
    headers: {},
    isBase64Encoded: false,
    requestContext: { requestId: 'req-1', http: { method: 'POST', sourceIp: '1.2.3.4' } },
  }) as unknown as APIGatewayProxyEventV2;

const valid = { name: 'Ivan Petrov', email: 'ivan@example.com', message: 'Hello, I want a project.' };
const call = async (e: APIGatewayProxyEventV2) => {
  const r = (await handler(e)) as { statusCode: number; body: string };
  return { status: r.statusCode, json: JSON.parse(r.body) };
};

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  ses.reset();
  ddb.reset();
  ses.on(SendEmailCommand).resolves({});
  ddb.on(UpdateItemCommand).resolves({ Attributes: { count: { N: '1' } } });
  process.env.LEAD_RECIPIENT_EMAIL = 'to@example.com';
  process.env.LEAD_FROM_EMAIL = 'noreply@krunai.uz';
  process.env.RATE_LIMIT_TABLE = 'rl';
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => logSpy.mockRestore());

describe('handler', () => {
  it('ru: sends email with [RU] and Language: RU', async () => {
    const r = await call(ev({ ...valid, locale: 'ru' }));
    expect(r).toEqual({ status: 200, json: { ok: true } });
    const input = ses.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(input.Content?.Simple?.Subject?.Data).toMatch(/^\[RU\] /);
    expect(input.Content?.Simple?.Body?.Text?.Data).toContain('Language: RU');
    expect(input.Destination?.ToAddresses).toEqual(['to@example.com']);
    expect(input.FromEmailAddress).toBe('noreply@krunai.uz');
    expect(input.ReplyToAddresses).toEqual(['ivan@example.com']);
  });

  it('recipient is never taken from the request', async () => {
    const r = await call(ev({ ...valid, to: 'evil@example.com', recipient: 'evil@example.com', ToAddresses: ['evil@example.com'] }));
    expect(r.status).toBe(200);
    const input = ses.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(input.Destination?.ToAddresses).toEqual(['to@example.com']);
    expect(JSON.stringify(input)).not.toContain('evil@example.com');
  });

  it.each(['LEAD_RECIPIENT_EMAIL', 'LEAD_FROM_EMAIL'])('missing %s -> 500 internal_error, SES not called', async (name) => {
    delete process.env[name];
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await call(ev(valid))).toEqual({ status: 500, json: { error: 'internal_error' } });
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
    expect(String(errSpy.mock.calls[0][0])).toContain('lead_email_config_error');
    errSpy.mockRestore();
  });

  it('send result logs: sent with messageId, failed with errorName, no PII', async () => {
    ses.on(SendEmailCommand).resolves({ MessageId: 'mid-1' });
    await call(ev({ ...valid, locale: 'ru' }));
    ses.on(SendEmailCommand).rejects(new Error('boom ivan@example.com'));
    await call(ev(valid));
    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    const sent = JSON.parse(lines.find((l) => l.includes('lead_email_sent'))!);
    expect(sent).toEqual({ event: 'lead_email_sent', messageId: 'mid-1', locale: 'ru', emailDomain: 'example.com' });
    const failed = JSON.parse(lines.find((l) => l.includes('lead_email_failed'))!);
    expect(failed).toEqual({ event: 'lead_email_failed', errorName: 'Error', locale: 'en', emailDomain: 'example.com' });
    const all = lines.join('\n');
    for (const s of ['Ivan', 'ivan@example.com', 'Hello, I want']) expect(all).not.toContain(s);
  });

  it('locale defaults to en', async () => {
    await call(ev(valid));
    const input = ses.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(input.Content?.Simple?.Subject?.Data).toMatch(/^\[EN\] /);
    expect(input.Content?.Simple?.Body?.Text?.Data).toContain('Language: EN');
  });

  it('invalid locale -> 400 invalid_value', async () => {
    const r = await call(ev({ ...valid, locale: 'de' }));
    expect(r).toEqual({ status: 400, json: { error: 'validation_error', fields: { locale: 'invalid_value' } } });
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  it('field validation codes', async () => {
    const r = await call(ev({ name: '', email: 'bad', message: 'short' }));
    expect(r.status).toBe(400);
    expect(r.json).toEqual({
      error: 'validation_error',
      fields: { name: 'required', email: 'invalid_format', message: 'too_short' },
    });
    const long = await call(ev({ ...valid, message: 'x'.repeat(2001), name: 'n'.repeat(101) }));
    expect(long.json.fields).toEqual({ name: 'too_long', message: 'too_long' });
    expect((await call(ev({ ...valid, message: undefined }))).json.fields).toEqual({ message: 'required' });
  });

  it('malformed JSON -> 400 bad_request', async () => {
    expect(await call(ev('{oops', true))).toEqual({ status: 400, json: { error: 'bad_request' } });
  });

  it('honeypot -> silent 200, no email, no rate limit hit', async () => {
    const r = await call(ev({ ...valid, website: 'http://spam' }));
    expect(r).toEqual({ status: 200, json: { ok: true } });
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
  });

  it('rate limit exceeded -> 429, no email; key is hashed IP', async () => {
    ddb.on(UpdateItemCommand).resolves({ Attributes: { count: { N: '6' } } });
    expect(await call(ev(valid))).toEqual({ status: 429, json: { error: 'rate_limited' } });
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
    const key = ddb.commandCalls(UpdateItemCommand)[0].args[0].input.Key?.pk.S;
    expect(key).toMatch(/^ip#[0-9a-f]{64}$/);
  });

  it('SES failure -> 500 internal_error', async () => {
    ses.on(SendEmailCommand).rejects(new Error('boom'));
    expect(await call(ev(valid))).toEqual({ status: 500, json: { error: 'internal_error' } });
  });

  it('logs contain no PII', async () => {
    await call(ev({ ...valid, locale: 'ru' }));
    await call(ev({ ...valid, email: 'bad' }));
    ses.on(SendEmailCommand).rejects(new Error('boom ivan@example.com'));
    await call(ev(valid));
    const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    for (const s of ['Ivan', 'ivan@example.com', 'Hello, I want', '1.2.3.4']) expect(logs).not.toContain(s);
    expect(logs).toContain('req-1');
  });
});
