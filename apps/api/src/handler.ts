import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { validateLead } from './validation';
import { checkRateLimit } from './rateLimit';
import { sendLeadEmail } from './email';

function respond(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': process.env.ALLOWED_ORIGIN ?? 'https://krunai.uz',
      vary: 'Origin',
    },
    body: JSON.stringify(body),
  };
}

// Structured log without PII: no name, email, phone, message text or raw IP.
function log(requestId: string | undefined, result: string, locale?: string, extra: object = {}) {
  console.log(JSON.stringify({ requestId, result, locale, ...extra }));
}

function clientIp(event: APIGatewayProxyEventV2): string {
  const xff = event.headers?.['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return event.requestContext?.http?.sourceIp ?? 'unknown';
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const requestId = event.requestContext?.requestId;

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: { 'access-control-allow-origin': process.env.ALLOWED_ORIGIN ?? 'https://krunai.uz', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } };
  }

  let parsed: unknown;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
      : (event.body ?? '');
    parsed = JSON.parse(raw);
  } catch {
    log(requestId, 'bad_request');
    return respond(400, { error: 'bad_request' });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    log(requestId, 'bad_request');
    return respond(400, { error: 'bad_request' });
  }

  const result = validateLead(parsed);
  if (result.ok && result.honeypot) {
    log(requestId, 'honeypot');
    return respond(200, { ok: true });
  }
  if (!result.ok) {
    log(requestId, 'validation_error', undefined, { fields: Object.keys(result.fields) });
    return respond(400, { error: 'validation_error', fields: result.fields });
  }
  const { lead } = result;

  try {
    if (!(await checkRateLimit(clientIp(event)))) {
      log(requestId, 'rate_limited', lead.locale);
      return respond(429, { error: 'rate_limited' });
    }
    await sendLeadEmail(lead);
  } catch (err) {
    log(requestId, 'internal_error', lead.locale, { errorName: err instanceof Error ? err.name : 'unknown' });
    return respond(500, { error: 'internal_error' });
  }

  log(requestId, 'sent', lead.locale);
  return respond(200, { ok: true });
};
