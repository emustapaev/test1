import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('./locale-router.js', import.meta.url), 'utf8');
function load(canonical) {
  // Тот же replace, что делает Terraform
  const code = canonical
    ? src.replace("var CANONICAL_HOST = 'krunai.uz';", `var CANONICAL_HOST = '${canonical}';`)
    : src;
  const c = vm.createContext({});
  vm.runInContext(code, c);
  return c.handler;
}
const handler = load();
const handlerWww = load('www.krunai.uz');

function run({ uri = '/', al, lang, qs, host, h = handler } = {}) {
  const request = { uri, headers: {}, cookies: {}, querystring: qs || {} };
  if (host !== undefined) request.headers.host = { value: host };
  if (al !== undefined) request.headers['accept-language'] = { value: al };
  if (lang !== undefined) request.cookies.lang = { value: lang };
  return h({ request });
}
const loc = (r) => r.headers.location.value;

test('ru-RU,ru;q=0.9,en;q=0.8 → /ru/', () => {
  assert.equal(loc(run({ al: 'ru-RU,ru;q=0.9,en;q=0.8' })), '/ru/');
});
test('en-US, uz-UZ, нет заголовка → /en/', () => {
  assert.equal(loc(run({ al: 'en-US' })), '/en/');
  assert.equal(loc(run({ al: 'uz-UZ' })), '/en/');
  assert.equal(loc(run({})), '/en/');
});
test('cookie приоритетнее Accept-Language', () => {
  assert.equal(loc(run({ lang: 'en', al: 'ru' })), '/en/');
  assert.equal(loc(run({ lang: 'ru', al: 'en' })), '/ru/');
});
test('невалидная cookie игнорируется', () => {
  assert.equal(loc(run({ lang: 'de', al: 'ru' })), '/ru/');
});
test('q-values', () => {
  assert.equal(loc(run({ al: 'en;q=0.9,ru;q=1' })), '/ru/');
  assert.equal(loc(run({ al: 'ru;q=0' })), '/en/');
  assert.equal(loc(run({ al: 'ru;q=0,en;q=0.5' })), '/en/');
});
test('query string сохраняется, включая повторы и кодирование', () => {
  assert.equal(loc(run({ al: 'ru', qs: { utm_source: { value: 'x' } } })), '/ru/?utm_source=x');
  const qs = { a: { value: '1', multiValue: [{ value: '1' }, { value: '2%20b' }] } };
  assert.equal(loc(run({ qs })), '/en/?a=1&a=2%20b');
});
test('заголовки ответа', () => {
  const r = run({});
  assert.equal(r.statusCode, 302);
  assert.equal(r.statusDescription, 'Found');
  assert.equal(r.headers['cache-control'].value, 'no-store');
});
test('прочие URI не редиректятся, каталоги → index.html', () => {
  assert.equal(run({ uri: '/ru/' }).uri, '/ru/index.html');
  assert.equal(run({ uri: '/en/' , al: 'ru'}).uri, '/en/index.html');
  assert.equal(run({ uri: '/ru/foo' }).uri, '/ru/foo/index.html');
  assert.equal(run({ uri: '/assets/app.js' }).uri, '/assets/app.js');
  assert.equal(run({ uri: '/ru/' }).statusCode, undefined);
});
test('www → apex: 301 с сохранением пути и query', () => {
  const r = run({ host: 'www.krunai.uz', uri: '/ru/', qs: { a: { value: '1' } } });
  assert.equal(r.statusCode, 301);
  assert.equal(loc(r), 'https://krunai.uz/ru/?a=1');
  assert.equal(r.headers['cache-control'].value, 'max-age=3600');
});
test('www → apex для корня без локали', () => {
  assert.equal(loc(run({ host: 'www.krunai.uz', uri: '/' })), 'https://krunai.uz/');
});
test('CANONICAL_HOST=www.krunai.uz: apex → 301 на www', () => {
  const r = run({ h: handlerWww, host: 'krunai.uz', uri: '/en/', qs: { x: { value: 'y' } } });
  assert.equal(r.statusCode, 301);
  assert.equal(loc(r), 'https://www.krunai.uz/en/?x=y');
});
test('запрос на канонический хост обрабатывается прежней логикой', () => {
  assert.equal(run({ host: 'krunai.uz', uri: '/ru/' }).uri, '/ru/index.html');
  assert.equal(loc(run({ host: 'krunai.uz', al: 'ru' })), '/ru/');
  assert.equal(run({ h: handlerWww, host: 'www.krunai.uz', uri: '/ru/' }).uri, '/ru/index.html');
});
test('хосты вне списка не редиректятся', () => {
  assert.equal(run({ host: 'd111111abcdef8.cloudfront.net', uri: '/ru/' }).uri, '/ru/index.html');
  assert.equal(run({ host: 'evilkrunai.uz', uri: '/ru/' }).statusCode, undefined);
});
test('нет console.log и размер < 10 KB', () => {
  assert.ok(!/console\./.test(src));
  assert.ok(Buffer.byteLength(src) < 10240);
});
