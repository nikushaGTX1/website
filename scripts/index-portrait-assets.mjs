import { readdir, readFile, writeFile } from 'node:fs/promises';
const directory = new URL('../public/images/ai-match/portraits/', import.meta.url);
const files = (await readdir(directory)).filter((name) => /^[a-z0-9-]+\.webp$/.test(name) && name !== 'room.webp').sort();
await writeFile(new URL('../src/app/ai-home-match/lifestyle-avatar/portrait-assets.ts', import.meta.url),
  '// Generated from saved portrait files by scripts/index-portrait-assets.mjs.\n' +
  'export const AVAILABLE_PORTRAIT_FILES = new Set<string>(' + JSON.stringify(files, null, 2) + ');\n');
console.log(`${files.length} complete portrait files indexed.`);
const { portraits, scope } = JSON.parse(await readFile(new URL('catalogue.json', directory), 'utf8'));
const missing = portraits.filter((item) => !files.includes(item.file)).map((item) => item.file);
await writeFile(new URL('coverage.json', directory), JSON.stringify({
  scope, expected: portraits.length, saved: portraits.length - missing.length,
  missing, complete: !missing.length,
}, null, 2));
