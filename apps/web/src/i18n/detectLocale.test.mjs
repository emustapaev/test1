import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLocale } from './detectLocale.ts';

const SUPPORTED = ['en', 'ru'];
const detect = (cookie, acceptLanguage) => detectLocale({ cookie, acceptLanguage }, SUPPORTED, 'en');

test('ru-RU,ru;q=0.9,en;q=0.8 → ru', () => {
  assert.equal(detect(undefined, 'ru-RU,ru;q=0.9,en;q=0.8'), 'ru');
});
test('en-US, uz-UZ, нет заголовка → en', () => {
  assert.equal(detect(undefined, 'en-US'), 'en');
  assert.equal(detect(undefined, 'uz-UZ'), 'en');
  assert.equal(detect(undefined, undefined), 'en');
});
test('cookie приоритетнее Accept-Language', () => {
  assert.equal(detect('en', 'ru'), 'en');
  assert.equal(detect('ru', 'en'), 'ru');
});
test('невалидная cookie игнорируется', () => {
  assert.equal(detect('de', 'ru'), 'ru');
});
test('q-values', () => {
  assert.equal(detect(undefined, 'en;q=0.9,ru;q=1'), 'ru');
  assert.equal(detect(undefined, 'ru;q=0'), 'en');
  assert.equal(detect(undefined, 'ru;q=0,en;q=0.5'), 'en');
  assert.equal(detect(undefined, 'ru;q=abc,en;q=0.1'), 'en');
});
