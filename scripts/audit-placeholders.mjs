import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const appRoot = join(root, 'src', 'app');

function filesIn(directory, extension) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? filesIn(path, extension)
      : path.endsWith(extension)
        ? [path]
        : [];
  });
}

function dictionaryKeys(path) {
  const source = readFileSync(path, 'utf8');
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const keys = new Set();
  function visit(node) {
    if (
      ts.isArrayLiteralExpression(node) &&
      node.elements.length === 2 &&
      (ts.isStringLiteral(node.elements[0]) || ts.isNoSubstitutionTemplateLiteral(node.elements[0]))
    ) {
      keys.add(node.elements[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return keys;
}

const dictionaries = {
  ka: dictionaryKeys(join(appRoot, 'i18n', 'georgian-translations.ts')),
  ru: dictionaryKeys(join(appRoot, 'i18n', 'russian-translations.ts')),
};
const placeholders = new Map();

function record(value, path) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || !/[A-Za-z]/.test(text) || /^[-+\d\s.,@]+$/.test(text)) return;
  if (!placeholders.has(text)) placeholders.set(text, new Set());
  placeholders.get(text).add(relative(root, path));
}

for (const path of filesIn(appRoot, '.html')) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(/\b(\[?placeholder\]?)\s*=\s*"([\s\S]*?)"/g)) {
    const [, attribute, value] = match;
    if (attribute === 'placeholder') {
      record(value, path);
      continue;
    }
    // Component-owned translation calls use semantic keys rather than
    // English placeholder copy and are audited by that component's table.
    if (/\bt\s*\(/.test(value)) continue;
    for (const literal of value.matchAll(/(['"])(.*?)\1/g)) record(literal[2], path);
  }
}

let missing = 0;
for (const [text, paths] of [...placeholders].sort(([a], [b]) => a.localeCompare(b))) {
  const languages = Object.entries(dictionaries)
    .filter(([, keys]) => !keys.has(text))
    .map(([language]) => language);
  if (!languages.length) continue;
  missing++;
  console.log(`${languages.join(',')}\t${text}\t${[...paths].join(', ')}`);
}

console.error(`Static placeholders: ${placeholders.size}; missing translations: ${missing}`);
process.exitCode = missing ? 1 : 0;
