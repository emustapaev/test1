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

export async function sendLeadEmail(lead: Lead): Promise<void> {
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: process.env.LEAD_FROM_EMAIL,
      Destination: { ToAddresses: [process.env.LEAD_TO_EMAIL as string] },
      ReplyToAddresses: [lead.email],
      Content: {
        Simple: {
          Subject: { Data: buildSubject(lead), Charset: 'UTF-8' },
          Body: { Text: { Data: buildBody(lead), Charset: 'UTF-8' } },
        },
      },
    }),
  );
}
