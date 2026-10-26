#!/usr/bin/env node
// Собирает handoff.json (контракт платформы) из `terraform output -json`.
// Использование: node scripts/deploy/build-handoff.mjs <outputs.json> [handoff.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ZONE = 'krunai.uz';
const TYPES = ['A', 'AAAA', 'CNAME', 'ALIAS', 'TXT', 'MX'];
const MAX_RECORDS = 30;

export class HandoffError extends Error {}

function out(outputs, key) {
  const o = outputs[key];
  if (o === undefined) throw new HandoffError(`В outputs нет ${key}`);
  return o && typeof o === 'object' && !Array.isArray(o) && 'value' in o ? o.value : o;
}

export function buildHandoff(outputs) {
  const siteUrl = out(outputs, 'site_url');
  if (typeof siteUrl !== 'string' || !siteUrl.startsWith('https://')) {
    throw new HandoffError('site_url: ожидался https-адрес');
  }
  const list = out(outputs, 'dns_records');
  if (!Array.isArray(list)) throw new HandoffError('dns_records: ожидался список');
  if (list.length > MAX_RECORDS) throw new HandoffError(`dns_records: больше ${MAX_RECORDS} записей`);
  const dnsRecords = list.map((r) => {
    if (!TYPES.includes(r.type)) throw new HandoffError(`Недопустимый тип записи: ${r.type}`);
    const name = String(r.name).replace(/\.$/, '').toLowerCase();
    if (name !== ZONE && !name.endsWith(`.${ZONE}`)) {
      throw new HandoffError(`Имя вне зоны ${ZONE}: ${r.name}`);
    }
    if (!r.value) throw new HandoffError(`Пустое значение записи ${name}`);
    return { type: r.type, name, value: String(r.value), purpose: r.purpose ?? '' };
  });
  return {
    zone: ZONE,
    site_url: siteUrl,
    dns_records: dnsRecords,
    after_dns: { set_variables: { KRUNAI_ENABLE_CUSTOM_DOMAIN: 'true' }, redeploy: true },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [input, output = 'handoff.json'] = process.argv.slice(2);
    if (!input) throw new HandoffError('Использование: build-handoff.mjs <outputs.json> [handoff.json]');
    const handoff = buildHandoff(JSON.parse(readFileSync(input, 'utf8')));
    writeFileSync(output, `${JSON.stringify(handoff, null, 2)}\n`);
  } catch (e) {
    console.error(e instanceof HandoffError ? e.message : e);
    process.exit(1);
  }
}
