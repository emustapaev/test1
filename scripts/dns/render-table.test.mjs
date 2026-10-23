import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildRows, parseBaseline, renderMarkdown } from './render-table.mjs';

const dir = fileURLToPath(new URL('.', import.meta.url));
const outputs = JSON.parse(readFileSync(`${dir}fixtures/outputs.json`, 'utf8'));
const baselineText = readFileSync(`${dir}../../docs/dns/baseline.txt`, 'utf8');
const script = `${dir}render-table.mjs`;
const fixture = `${dir}fixtures/outputs.json`;

const key = (r) => `${r.type} ${r.name}`;

test('таблица: ACM, сайт, 3 DKIM, MAIL FROM; относительные имена', () => {
  const rows = buildRows(outputs, { baseline: parseBaseline(baselineText) });
  const keys = rows.map(key);
  assert.ok(keys.includes('CNAME _abc123'));
  assert.ok(keys.includes('CNAME _x1y2z3.www'));
  assert.ok(keys.includes('ALIAS '));
  assert.ok(keys.includes('CNAME www'));
  assert.equal(rows.filter((r) => r.name.endsWith('._domainkey') && r.type === 'CNAME').length, 3);
  assert.ok(keys.includes('MX mail'));
  assert.ok(keys.includes('TXT mail'));
  assert.ok(rows.every((r) => !r.name.endsWith('.') && !r.name.includes('krunai.uz') && r.ttl === 3600));
});

test('нет apex MX/TXT и _dmarc из outputs; DMARC опционален только при пустом baseline', () => {
  const rows = buildRows(outputs, { baseline: parseBaseline(baselineText) });
  assert.ok(!rows.some((r) => (r.type === 'MX' || r.type === 'TXT') && r.name === ''));
  const dmarc = rows.filter((r) => r.name === '_dmarc');
  assert.equal(dmarc.length, 1);
  assert.equal(dmarc[0].value, 'v=DMARC1; p=none');
  assert.equal(dmarc[0].required, 'Опционально');

  const withDmarc = parseBaseline(`${baselineText}\n## TXT _dmarc (TXT _dmarc.krunai.uz)\n"v=DMARC1; p=reject"\n`);
  assert.ok(!buildRows(outputs, { baseline: withDmarc }).some((r) => r.name === '_dmarc'));
});

test('--canonical www: нет ALIAS, есть redirect apex -> www', () => {
  const rows = buildRows(outputs, { canonical: 'www' });
  assert.ok(!rows.some((r) => r.type === 'ALIAS'));
  assert.ok(rows.some((r) => r.type === 'Web redirect' && r.value === 'https://www.krunai.uz'));
});

test('отказ: MX/TXT на apex и _dmarc в outputs', () => {
  const bad = structuredClone(outputs);
  bad.ses_mail_from_records.value[0].name = 'krunai.uz';
  assert.throws(() => buildRows(bad), /apex/);
  const bad2 = structuredClone(outputs);
  bad2.ses_mail_from_records.value[1].name = '_dmarc.krunai.uz';
  assert.throws(() => buildRows(bad2), /_dmarc/);
});

test('CLI: печатает таблицу, код 0', () => {
  const r = spawnSync('node', [script, fixture, '--baseline', `${dir}../../docs/dns/baseline.txt`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\| Назначение \| Тип \| Имя \(host\)/);
  assert.equal(r.stdout, renderMarkdown(buildRows(outputs, { baseline: parseBaseline(baselineText) })) + '\n');
});

test('CLI: селектор SES совпал с Zoho -> ненулевой код выхода', () => {
  const clash = structuredClone(outputs);
  clash.ses_dkim_records.value[0].name = 'zmail._domainkey.krunai.uz';
  const tmp = `${process.env.TMPDIR || '/tmp'}/render-table-clash-${process.pid}.json`;
  const bl = `${tmp}.baseline.txt`;
  return import('node:fs').then(({ writeFileSync, rmSync }) => {
    writeFileSync(tmp, JSON.stringify(clash));
    writeFileSync(bl, '## DKIM zmail TXT (TXT zmail._domainkey.krunai.uz)\nv=DKIM1; k=rsa; p=AAA\n');
    try {
      const r = spawnSync('node', [script, tmp, '--baseline', bl], { encoding: 'utf8' });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /zmail/);
    } finally {
      rmSync(tmp);
      rmSync(bl);
    }
  });
});
