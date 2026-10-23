import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages');

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? flatten(v, key) : [key];
  });
}

const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const keys = {};
for (const f of files) {
  try {
    keys[f] = new Set(flatten(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
  } catch (e) {
    console.error(`check-i18n: cannot parse messages/${f}: ${e.message}`);
    process.exit(1);
  }
}

const all = new Set(Object.values(keys).flatMap((s) => [...s]));
let failed = false;
for (const f of files) {
  const missing = [...all].filter((k) => !keys[f].has(k)).sort();
  if (missing.length) {
    failed = true;
    console.error(`check-i18n: messages/${f} is missing ${missing.length} key(s):`);
    for (const k of missing) console.error(`  - ${k}`);
  }
}

if (failed) process.exit(1);
console.log(`check-i18n: OK (${files.length} locales, ${all.size} keys)`);
