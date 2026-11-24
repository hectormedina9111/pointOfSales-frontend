// Verifica que es.json y en.json tengan las mismas claves y que toda clave usada en
// plantillas y código ('clave' | translate, translate('clave')) exista en ambos.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const es = JSON.parse(readFileSync('public/i18n/es.json', 'utf8'));
const en = JSON.parse(readFileSync('public/i18n/en.json', 'utf8'));
const errors = [];
for (const k of Object.keys(es)) if (!(k in en)) errors.push(`missing in en.json: ${k}`);
for (const k of Object.keys(en)) if (!(k in es)) errors.push(`missing in es.json: ${k}`);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') || p.endsWith('.html')) out.push(p);
  }
  return out;
}
const used = new Set();
const patterns = [/'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'\s*\|\s*translate/g, /translate\(\s*'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'/g];
for (const file of walk('src/app')) {
  const text = readFileSync(file, 'utf8');
  for (const re of patterns) for (const m of text.matchAll(re)) used.add(m[1]);
}
for (const k of used) if (!(k in es)) errors.push(`used but not translated: ${k}`);

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`i18n OK: ${Object.keys(es).length} keys, ${used.size} literal keys used`);
