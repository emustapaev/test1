import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildHandoff, HandoffError } from './build-handoff.mjs';

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/outputs.json', import.meta.url), 'utf8'));

test('собирает handoff по контракту платформы', () => {
  const h = buildHandoff(fixture());
  assert.equal(h.zone, 'krunai.uz');
  assert.equal(h.site_url, 'https://d111111abcdef8.cloudfront.net');
  assert.equal(h.dns_records.length, 5);
  assert.deepEqual(h.dns_records[1], {
    type: 'ALIAS', name: 'krunai.uz', value: 'd111111abcdef8.cloudfront.net', purpose: 'основной домен сайта',
  });
  assert.deepEqual(h.after_dns, { set_variables: { KRUNAI_ENABLE_CUSTOM_DOMAIN: 'true' }, redeploy: true });
});

test('убирает точку на конце имени', () => {
  const o = fixture();
  o.dns_records.value[0].name = '_abc123.krunai.uz.';
  assert.equal(buildHandoff(o).dns_records[0].name, '_abc123.krunai.uz');
});

test('отказ: имя вне зоны', () => {
  const o = fixture();
  o.dns_records.value[0].name = 'evil.example.com';
  assert.throws(() => buildHandoff(o), HandoffError);
});

test('отказ: недопустимый тип и больше 30 записей', () => {
  const o = fixture();
  o.dns_records.value[0].type = 'SRV';
  assert.throws(() => buildHandoff(o), HandoffError);
  const many = fixture();
  many.dns_records.value = Array(31).fill(many.dns_records.value[1]);
  assert.throws(() => buildHandoff(many), HandoffError);
});

test('отказ: нет site_url', () => {
  const o = fixture();
  delete o.site_url;
  assert.throws(() => buildHandoff(o), HandoffError);
});
