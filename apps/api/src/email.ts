import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { Lead } from './validation';

const client = new SESv2Client({});

export function buildSubject(lead: Lead): string {
  // v1 subject: "New lead from krunai.uz: {name}" prefixed with the locale tag.
  const name = lead.name.replace(/[\p{Cc}\u2028\u2029]+/gu, ' ').trim();
  return `[${lead.locale.toUpperCase()}] New lead from krunai.uz: ${name}`;
}

export function buildBody(lead: Lead): string {
  return [
    'New lead from krunai.uz',
    '',
    `Language: ${lead.locale.toUpperCase()}`,
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    '',
    'Message:',
    lead.message,
    '',
  ].join('\n');
}

export interface EmailConfig {
  recipient: string;
  from: string;
}

// Recipient and sender come only from the environment, never from the request.
export function getEmailConfig(): EmailConfig | null {
  const recipient = process.env.LEAD_RECIPIENT_EMAIL?.trim();
  const from = process.env.LEAD_FROM_EMAIL?.trim();
  return recipient && from ? { recipient, from } : null;
}

// Log line without PII: only the visitor's email domain is recorded.
function logEmail(event: string, lead: Lead, extra: object) {
  const emailDomain = lead.email.slice(lead.email.lastIndexOf('@') + 1).toLowerCase();
  console.log(JSON.stringify({ event, ...extra, locale: lead.locale, emailDomain }));
}

export async function sendLeadEmail(lead: Lead): Promise<void> {
  const config = getEmailConfig();
  if (!config) {
    console.error(JSON.stringify({ event: 'lead_email_config_error', missing: 'LEAD_RECIPIENT_EMAIL/LEAD_FROM_EMAIL' }));
    const err = new Error('email configuration missing');
    err.name = 'ConfigError';
    throw err;
  }
  try {
    const res = await client.send(
      new SendEmailCommand({
        FromEmailAddress: config.from,
        Destination: { ToAddresses: [config.recipient] },
        ReplyToAddresses: [lead.email],
        Content: {
          Simple: {
            Subject: { Data: buildSubject(lead), Charset: 'UTF-8' },
            Body: { Text: { Data: buildBody(lead), Charset: 'UTF-8' } },
          },
        },
      }),
    );
    logEmail('lead_email_sent', lead, { messageId: res?.MessageId });
  } catch (err) {
    logEmail('lead_email_failed', lead, { errorName: err instanceof Error ? err.name : 'unknown' });
    throw err;
  }
}
