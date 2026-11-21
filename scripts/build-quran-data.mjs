// Builds src/data/quran.json from the `quran-json` package (CC-BY-4.0, text from Tanzil.net).
// Run: node scripts/build-quran-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const src = JSON.parse(readFileSync(require.resolve('quran-json/dist/quran_ur.json'), 'utf8'));

const out = src.map((s) => ({
  id: s.id,
  name: s.name,
  tr: s.transliteration,
  meaning: s.translation,
  type: s.type,
  verses: s.verses.map((v) => [v.text, v.translation]),
}));

writeFileSync(new URL('../src/data/quran.json', import.meta.url), JSON.stringify(out));
const verses = out.reduce((n, s) => n + s.verses.length, 0);
console.log(`Wrote ${out.length} surahs, ${verses} verses`);
