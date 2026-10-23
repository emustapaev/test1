#!/usr/bin/env node
// Генератор Markdown-таблицы добавляемых DNS-записей для ClouDNS.
// Использование: node scripts/dns/render-table.mjs <outputs.json> [--baseline docs/dns/baseline.txt]
//                [--canonical apex|www] [--domain krunai.uz]
// Вход: `terraform output -json` (поле .value у каждого output) либо простой объект {имя: [...]}.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TTL = 3600;
const DMARC_VALUE = 'v=DMARC1; p=none';

export class RenderError extends Error {}

/** Разбирает baseline.txt: { 'NS': [...], 'DKIM zmail TXT': [...], ... } */
export function parseBaseline(text) {
  const sections = {};
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      cur = line.slice(3).replace(/\s*\(.*\)\s*$/, '');
      sections[cur] = [];
    } else if (line && !line.startsWith('#') && cur) {
      sections[cur].push(line);
    }
  }
  return sections;
}

/** Селекторы DKIM Zoho: те, у которых в baseline есть TXT или CNAME. */
export function zohoSelectors(baseline) {
  const sels = new Set();
  for (const [title, lines] of Object.entries(baseline)) {
    const m = /^DKIM (\S+) (TXT|CNAME)$/.exec(title);
    if (m && lines.length) sels.add(m[1]);
  }
  return sels;
}

/** Имя в формате ClouDNS: относительное, без точки на конце, apex = ''. */
export function relativeName(name, domain) {
  const n = name.replace(/\.$/, '').toLowerCase();
  if (n === domain) return '';
  if (n.endsWith(`.${domain}`)) return n.slice(0, -domain.length - 1);
  return n;
}

function outputList(outputs, key) {
  const o = outputs[key];
  if (o === undefined) throw new RenderError(`В outputs нет ${key}`);
  const list = Array.isArray(o) ? o : o.value;
  if (!Array.isArray(list)) throw new RenderError(`${key}: ожидался список {name,type,value}`);
  return list;
}

export function buildRows(outputs, { baseline = null, canonical = 'apex', domain = 'krunai.uz' } = {}) {
  const rows = [];
  const add = (purpose, rec, required) =>
    rows.push({ purpose, type: rec.type, name: relativeName(rec.name, domain), value: rec.value, ttl: TTL, required });

  for (const r of outputList(outputs, 'acm_validation_records')) {
    add('Подтверждение сертификата HTTPS (ACM)', r, 'Обязательно, сначала');
  }
  for (const r of outputList(outputs, 'dns_records')) {
    const rel = relativeName(r.name, domain);
    if (r.type === 'ALIAS' && rel === '' && canonical === 'www') continue;
    add(rel === '' ? 'Сайт, основной адрес (apex)' : 'Сайт, адрес с www', r, 'Обязательно, на этапе 2');
  }
  if (canonical === 'www') {
    rows.push({
      purpose: 'Сайт: переход с основного адреса на www',
      type: 'Web redirect',
      name: '',
      value: `https://www.${domain}`,
      ttl: TTL,
      required: 'Обязательно, на этапе 2 (настройка в ClouDNS, не DNS-запись)',
    });
  }
  for (const r of outputList(outputs, 'ses_dkim_records')) add('Подпись писем DKIM (Amazon SES)', r, 'Обязательно');
  for (const r of outputList(outputs, 'ses_mail_from_records')) {
    add(r.type === 'MX' ? 'Служебный адрес отправки SES (MAIL FROM), MX' : 'Служебный адрес отправки SES (MAIL FROM), SPF', r, 'Обязательно');
  }

  // Защита почты Zoho: ничего не меняем на apex и в _dmarc.
  for (const row of rows) {
    if ((row.type === 'MX' || row.type === 'TXT') && row.name === '') {
      throw new RenderError(`Отказ: запись ${row.type} на apex изменила бы почту Zoho`);
    }
    if (row.name === '_dmarc') throw new RenderError('Отказ: _dmarc нельзя выводить из outputs (DMARC не менять)');
  }

  if (baseline) {
    const zoho = zohoSelectors(baseline);
    for (const row of rows) {
      const m = /^([^.]+)\._domainkey(\.|$)/.exec(row.name);
      if (m && zoho.has(m[1])) {
        throw new RenderError(`Селектор SES "${m[1]}" совпадает с селектором DKIM Zoho`);
      }
    }
    if (!(baseline['TXT _dmarc'] || []).length) {
      rows.push({
        purpose: 'Политика DMARC (только мониторинг)',
        type: 'TXT',
        name: '_dmarc',
        value: DMARC_VALUE,
        ttl: TTL,
        required: 'Опционально',
      });
    }
  }
  return rows;
}

export function renderMarkdown(rows) {
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const lines = [
    '| Назначение | Тип | Имя (host) | Значение | TTL | Обязательность |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const name = r.name === '' ? '*(пусто)*' : `\`${r.name}\``;
    lines.push(`| ${esc(r.purpose)} | ${r.type} | ${name} | \`${esc(r.value)}\` | ${r.ttl} | ${esc(r.required)} |`);
  }
  return lines.join('\n');
}

function main(argv) {
  const args = { file: null, baseline: null, canonical: 'apex', domain: 'krunai.uz' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--baseline') args.baseline = argv[++i];
    else if (a === '--canonical') args.canonical = argv[++i];
    else if (a === '--domain') args.domain = argv[++i];
    else if (!args.file) args.file = a;
    else throw new RenderError(`Неизвестный аргумент: ${a}`);
  }
  if (!args.file) throw new RenderError('Использование: render-table.mjs <outputs.json> [--baseline файл] [--canonical apex|www]');
  if (!['apex', 'www'].includes(args.canonical)) throw new RenderError('--canonical: apex или www');
  const outputs = JSON.parse(readFileSync(args.file, 'utf8'));
  const baseline = args.baseline ? parseBaseline(readFileSync(args.baseline, 'utf8')) : null;
  if (!baseline) console.error('Предупреждение: baseline не задан, селекторы Zoho не проверены');
  console.log(renderMarkdown(buildRows(outputs, { baseline, canonical: args.canonical, domain: args.domain })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof RenderError ? e.message : e);
    process.exit(1);
  }
}
